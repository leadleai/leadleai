"""
Spreadsheet lead import (Excel / CSV).

Two-step, STATELESS flow so nothing is buffered server-side between requests
(Cloud Run scale-to-zero friendly, and keeps memory flat):

  POST /api/leads/import-file
      multipart upload of one .xlsx/.xls/.csv. Parses only the header row + a few
      preview rows and returns the detected columns, a preview, a suggested
      column->field mapping, and the total row count. NOTHING is written.

  POST /api/leads/import-file/confirm
      the SAME file re-uploaded, plus a column MAPPING (spreadsheet column ->
      name / phone / email / company / enquiry). Parses every row, normalizes
      phones toward E.164 (+91 default), dedupes on phone/email WITHIN the caller's
      org, inserts new leads (source='import', status='new') and updates existing
      ones. Returns imported / updated / skipped (with reasons).

Both endpoints are authenticated and org-scoped: every write goes under the
CALLING user's org (never the default org), and rows are inserted with the user's
token so Postgres RLS is the backstop. Newly inserted 'new' leads flow through the
existing auto-call + follow-up engine unchanged — with all the usual guardrails
(quiet hours, dedupe, call-once, follow-up cap, unsubscribe) — via
auto_call.schedule_for_imported(), exactly like the CRM importer.

Parsing is LIGHTWEIGHT on purpose: the stdlib `csv` module for CSV, and openpyxl
in read-only streaming mode for .xlsx (xlrd for legacy .xls). No pandas/numpy.
"""
import csv
import io
import json
import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

import auto_call
import supabase_client as sb
from auth import OrgContext, require_org, sb_error

logger = logging.getLogger("lead_import")
router = APIRouter(prefix="/api/leads", tags=["leads"])

# The lead fields a spreadsheet column can be mapped onto. `name` is the only one
# with a hard DB NOT NULL we synthesize a fallback for; the rest may be blank.
IMPORT_FIELDS = ["name", "phone", "email", "company", "enquiry"]

# Guardrails so one upload can't exhaust the 512MB box.
MAX_UPLOAD_BYTES = 8 * 1024 * 1024   # 8 MB
MAX_ROWS = 10_000                    # data rows honoured on confirm
MAX_PREVIEW_ROWS = 8                 # rows returned by the preview step

E164 = re.compile(r"^\+[1-9]\d{7,14}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
DEFAULT_ENQUIRY = "Imported from file"

# Header keywords -> field, for auto-suggesting a mapping. First match wins, and
# `name` is checked in a way that "company name" doesn't steal the person's name.
_HEADER_HINTS: List[Tuple[str, List[str]]] = [
    ("email", ["email", "e-mail", "mail", "email address"]),
    ("phone", ["phone", "mobile", "cell", "contact number", "contact no", "whatsapp", "tel", "number"]),
    ("company", ["company", "organisation", "organization", "org", "business", "firm", "account"]),
    ("enquiry", ["enquiry", "inquiry", "message", "notes", "note", "comment", "requirement", "details", "query", "description"]),
    ("name", ["name", "full name", "customer", "contact name", "lead name", "person", "client"]),
]


# ── Phone normalization ──────────────────────────────────────────────────────
def normalize_phone(raw: Optional[str], default_cc: str = "+91") -> Tuple[str, bool]:
    """Best-effort push toward E.164. Returns (value, is_e164).

    Never DROPS an unrecognized number: if it can't be confidently normalized the
    cleaned original is returned with is_e164=False, so it still lands as a lead
    (just not auto-call-eligible until fixed). `default_cc` (e.g. '+91') is applied
    to bare national numbers.
    """
    if raw is None:
        return "", False
    s = str(raw).strip()
    if not s:
        return "", False

    # Spreadsheets often store phones as floats: "9812345678.0" -> "9812345678".
    if re.fullmatch(r"\d+\.0", s):
        s = s[:-2]

    had_plus = s.lstrip().startswith("+")
    digits = re.sub(r"\D", "", s)
    if not digits:
        return s, False  # nothing numeric — keep as-is, flagged invalid

    cc_digits = re.sub(r"\D", "", default_cc) or "91"

    if had_plus:
        candidate = "+" + digits
    elif digits.startswith("00"):
        candidate = "+" + digits[2:]           # 0044... international prefix
    elif len(digits) == 10:
        candidate = default_cc + digits         # bare national mobile
    elif digits.startswith(cc_digits) and len(digits) > 10:
        candidate = "+" + digits                # already carries the country code
    elif len(digits) == 11 and digits.startswith("0"):
        candidate = default_cc + digits[1:]     # national with a trunk 0
    else:
        candidate = "+" + digits                # last resort: assume it's E.164-ish

    return (candidate, True) if E164.match(candidate) else (candidate, False)


# ── Parsing (lightweight: csv module + openpyxl/xlrd read-only) ──────────────
def _clean_header(value: Any, index: int) -> str:
    text = "" if value is None else str(value).strip()
    return text or f"Column {index + 1}"


def _dedupe_headers(headers: List[str]) -> List[str]:
    """PostgREST-agnostic, but a mapping keyed by header needs unique labels."""
    seen: Dict[str, int] = {}
    out: List[str] = []
    for h in headers:
        if h in seen:
            seen[h] += 1
            out.append(f"{h} ({seen[h]})")
        else:
            seen[h] = 0
            out.append(h)
    return out


def _cell_to_str(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))     # 42.0 -> "42" (openpyxl reads ints as floats)
    return str(value).strip()


def _parse_csv(content: bytes, max_rows: int) -> Tuple[List[str], List[List[str]]]:
    # utf-8-sig strips a BOM if present; fall back to latin-1 so odd exports at
    # least parse rather than 500.
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1", errors="replace")
    reader = csv.reader(io.StringIO(text))
    rows_iter = iter(reader)
    try:
        header_row = next(rows_iter)
    except StopIteration:
        return [], []
    headers = _dedupe_headers([_clean_header(c, i) for i, c in enumerate(header_row)])
    width = len(headers)
    rows: List[List[str]] = []
    for raw in rows_iter:
        if len(rows) >= max_rows:
            break
        cells = [_cell_to_str(c) for c in raw[:width]]
        cells += [""] * (width - len(cells))
        rows.append(cells)
    return headers, rows


def _parse_xlsx(content: bytes, max_rows: int) -> Tuple[List[str], List[List[str]]]:
    try:
        import openpyxl
    except ImportError:  # pragma: no cover
        raise HTTPException(
            status_code=503,
            detail="Excel support isn't installed on the server (openpyxl). Upload a CSV, or ask an admin to add openpyxl.",
        )
    try:
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Couldn't read that Excel file: {e}")
    try:
        ws = wb.active
        rows_iter = ws.iter_rows(values_only=True)
        try:
            header_row = next(rows_iter)
        except StopIteration:
            return [], []
        headers = _dedupe_headers([_clean_header(c, i) for i, c in enumerate(header_row)])
        width = len(headers)
        rows: List[List[str]] = []
        for raw in rows_iter:
            if len(rows) >= max_rows:
                break
            raw = list(raw)[:width]
            cells = [_cell_to_str(c) for c in raw]
            cells += [""] * (width - len(cells))
            if any(cells):  # skip fully blank trailing rows Excel loves to include
                rows.append(cells)
        return headers, rows
    finally:
        wb.close()


def _parse_xls(content: bytes, max_rows: int) -> Tuple[List[str], List[List[str]]]:
    try:
        import xlrd
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="Legacy .xls support isn't installed on the server (xlrd). Re-save the file as .xlsx or .csv and upload again.",
        )
    try:
        book = xlrd.open_workbook(file_contents=content)
        sheet = book.sheet_by_index(0)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Couldn't read that .xls file: {e}")
    if sheet.nrows == 0:
        return [], []
    headers = _dedupe_headers([_clean_header(sheet.cell_value(0, c), c) for c in range(sheet.ncols)])
    width = len(headers)
    rows: List[List[str]] = []
    for r in range(1, sheet.nrows):
        if len(rows) >= max_rows:
            break
        cells = [_cell_to_str(sheet.cell_value(r, c)) for c in range(width)]
        if any(cells):
            rows.append(cells)
    return headers, rows


def parse_spreadsheet(filename: str, content: bytes, max_rows: int) -> Tuple[List[str], List[List[str]]]:
    """Dispatch on extension -> (headers, rows). Rows are capped at `max_rows`."""
    name = (filename or "").lower().strip()
    if name.endswith(".csv"):
        return _parse_csv(content, max_rows)
    if name.endswith(".xlsx") or name.endswith(".xlsm"):
        return _parse_xlsx(content, max_rows)
    if name.endswith(".xls"):
        return _parse_xls(content, max_rows)
    # No/unknown extension: sniff. Real xlsx is a zip ("PK"); real xls starts with
    # the OLE magic; otherwise treat as CSV.
    if content[:2] == b"PK":
        return _parse_xlsx(content, max_rows)
    if content[:4] == b"\xd0\xcf\x11\xe0":
        return _parse_xls(content, max_rows)
    return _parse_csv(content, max_rows)


def suggest_mapping(headers: List[str]) -> Dict[str, Optional[str]]:
    """Guess a column for each field from its header text. Returns {field: header|None}."""
    mapping: Dict[str, Optional[str]] = {f: None for f in IMPORT_FIELDS}
    used: set = set()
    lowered = [(h, h.lower().strip()) for h in headers]
    for field, needles in _HEADER_HINTS:
        for header, low in lowered:
            if header in used:
                continue
            if any(n == low for n in needles) or any(n in low for n in needles):
                mapping[field] = header
                used.add(header)
                break
    return mapping


# ── Request/response models ──────────────────────────────────────────────────
class ImportPreview(BaseModel):
    filename: str
    columns: List[str]
    preview: List[Dict[str, str]]      # first N rows, keyed by column header
    row_count: int                     # data rows detected (capped at MAX_ROWS)
    truncated: bool                    # true if the file has more than MAX_ROWS rows
    fields: List[str] = IMPORT_FIELDS
    suggested_mapping: Dict[str, Optional[str]]


class ImportSummary(BaseModel):
    imported: int
    updated: int
    skipped: int
    total: int
    skipped_reasons: Dict[str, int]
    # Auto-call outcome for the newly imported 'new' leads (same shape the CRM
    # importer returns): {"queued": n, "skipped": {"disabled","quiet_hours","duplicate","not_new"}}
    auto_calls: Dict[str, Any] = {}


# ── Shared upload read + validation ──────────────────────────────────────────
async def _read_upload(file: UploadFile) -> bytes:
    name = (file.filename or "").lower()
    if not name.endswith((".csv", ".xlsx", ".xlsm", ".xls")):
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Upload a .csv, .xlsx, or .xls spreadsheet.",
        )
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File is too large ({len(content) // 1024} KB). The limit is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
        )
    return content


# ── Endpoints ────────────────────────────────────────────────────────────────
@router.post("/import-file", response_model=ImportPreview)
async def import_file_preview(
    file: UploadFile = File(...),
    ctx: OrgContext = Depends(require_org),
):
    """Step 1: parse headers + a preview so the user can map columns. No writes."""
    content = await _read_upload(file)
    # Parse one extra row past the preview so `truncated` is honest about "there's
    # more" without walking the whole file here.
    headers, rows = parse_spreadsheet(file.filename, content, MAX_ROWS + 1)
    if not headers:
        raise HTTPException(status_code=400, detail="Couldn't find any columns in that file. Is the first row a header?")

    truncated = len(rows) > MAX_ROWS
    row_count = min(len(rows), MAX_ROWS)
    preview = [dict(zip(headers, r)) for r in rows[:MAX_PREVIEW_ROWS]]

    logger.info("[import-file preview org=%s] %s: %d cols, %d rows%s",
                ctx.org_id, file.filename, len(headers), row_count, " (truncated)" if truncated else "")
    return ImportPreview(
        filename=file.filename or "upload",
        columns=headers,
        preview=preview,
        row_count=row_count,
        truncated=truncated,
        suggested_mapping=suggest_mapping(headers),
    )


def _parse_mapping(mapping_json: str, headers: List[str]) -> Dict[str, int]:
    """Turn the {field: column_header} JSON into {field: column_index}, keeping only
    fields mapped to a real column. Raises 400 on malformed input or unknown columns."""
    try:
        raw = json.loads(mapping_json)
    except (json.JSONDecodeError, TypeError):
        raise HTTPException(status_code=400, detail="Column mapping must be valid JSON.")
    if not isinstance(raw, dict):
        raise HTTPException(status_code=400, detail="Column mapping must be an object of field -> column.")

    index_of = {h: i for i, h in enumerate(headers)}
    resolved: Dict[str, int] = {}
    for field, column in raw.items():
        if field not in IMPORT_FIELDS or column in (None, ""):
            continue
        if column not in index_of:
            raise HTTPException(status_code=400, detail=f"Mapped column '{column}' isn't in the uploaded file.")
        resolved[field] = index_of[column]

    if not any(f in resolved for f in ("name", "phone", "email")):
        raise HTTPException(
            status_code=400,
            detail="Map at least one of name, phone, or email before importing.",
        )
    return resolved


@router.post("/import-file/confirm", response_model=ImportSummary)
async def import_file_confirm(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    mapping: str = Form(...),
    ctx: OrgContext = Depends(require_org),
):
    """Step 2: parse every row with the confirmed mapping, then dedupe + import into
    the CALLING user's org. Newly created 'new' leads are queued for auto-call.

    Guardrails preserved: org_id is always ctx.org_id (never the default org);
    inserts run with the user's token so RLS applies; dedupe is org-scoped; rows
    with no name AND no contact info are skipped; phones are normalized toward
    E.164 but never dropped."""
    content = await _read_upload(file)
    headers, rows = parse_spreadsheet(file.filename, content, MAX_ROWS)
    if not headers:
        raise HTTPException(status_code=400, detail="Couldn't find any columns in that file.")

    col = _parse_mapping(mapping, headers)

    def value(row: List[str], field: str) -> str:
        idx = col.get(field)
        return row[idx].strip() if idx is not None and idx < len(row) else ""

    imported = updated = skipped = 0
    reasons: Dict[str, int] = {"empty": 0, "no_contact": 0, "invalid": 0}
    new_leads: List[Dict[str, Any]] = []
    imported_not_new = 0

    try:
        for row in rows:
            name = value(row, "name")
            phone_raw = value(row, "phone")
            email = value(row, "email")
            company = value(row, "company")
            enquiry = value(row, "enquiry")

            if not any([name, phone_raw, email, company, enquiry]):
                skipped += 1
                reasons["empty"] += 1
                continue

            phone, _phone_ok = normalize_phone(phone_raw)
            email = email if EMAIL_RE.match(email) else ""

            # Skip rows missing a name AND any way to reach them.
            if not name and not phone and not email:
                skipped += 1
                reasons["no_contact"] += 1
                continue

            # DB requires all four columns NOT NULL; synthesize gentle fallbacks
            # so a partial row still becomes a usable lead.
            lead_name = name or company or phone or email or "Imported lead"

            existing = await sb.find_lead_by_contact(phone, email, org_id=ctx.org_id, token=ctx.token)
            if existing:
                # Update contact fields; PRESERVE the local status so we never
                # clobber auto-call/manual progress (and updated rows aren't re-called).
                fields = {"name": lead_name, "source": "import"}
                if phone:
                    fields["phone"] = phone
                if email:
                    fields["email"] = email
                if company:
                    fields["company"] = company
                if enquiry:
                    fields["enquiry"] = enquiry
                await sb.update_lead_fields(existing["id"], fields, org_id=ctx.org_id, token=ctx.token)
                updated += 1
                continue

            created = await sb.insert_lead({
                "org_id": ctx.org_id,           # the CALLING user's org, never default
                "name": lead_name,
                "phone": phone,
                "email": email,
                "company": company or None,
                "enquiry": enquiry or DEFAULT_ENQUIRY,
                "status": "new",
                "source": "import",
            }, token=ctx.token)
            imported += 1
            if created and created.get("status") == "new":
                new_leads.append(created)       # auto-call candidate
            else:
                imported_not_new += 1
    except sb.SupabaseNotConfigured as e:
        raise HTTPException(status_code=503, detail=str(e))
    except sb.SupabaseError as e:
        raise HTTPException(status_code=502, detail=f"Supabase error: {e.message}")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("[import-file confirm org=%s] failed", ctx.org_id)
        raise sb_error(e)

    # Queue auto-calls for the NEW leads through the existing engine (same master
    # switch, quiet hours, dedupe, and call-once claim as inbound/CRM leads). The
    # follow-up sweep picks them up on its own schedule — no wiring needed here.
    auto = await auto_call.schedule_for_imported(new_leads, background_tasks)
    auto.setdefault("skipped", {})["not_new"] = imported_not_new

    logger.info(
        "[import-file confirm org=%s] imported=%d updated=%d skipped=%d (total=%d) reasons=%s | auto-calls queued=%d",
        ctx.org_id, imported, updated, skipped, len(rows), reasons, auto.get("queued", 0),
    )
    return ImportSummary(
        imported=imported, updated=updated, skipped=skipped, total=len(rows),
        skipped_reasons={k: v for k, v in reasons.items() if v},
        auto_calls=auto,
    )
