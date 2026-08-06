"""
Custom fields: per-org lead attributes an org defines for itself, plus each
lead's values for those fields.

Two concerns, two routers, both authenticated and org-scoped (USER mode -> RLS):

  DEFINITIONS  (the org's schema — /api/custom-fields)
    GET    /api/custom-fields              list this org's field definitions
    POST   /api/custom-fields              create a definition
    PATCH  /api/custom-fields/{def_id}     edit label / options
    DELETE /api/custom-fields/{def_id}     delete a definition (and its values)

  VALUES  (one lead's data — /api/leads)
    GET  /api/leads/{lead_id}/custom-fields            defs merged with the lead's values
    PUT  /api/leads/{lead_id}/custom-fields/{def_id}   set one value  {value}

field_key is an immutable slug (lower_snake) chosen at creation; label and, for
select fields, options can be edited afterwards. Values are stored as text and
validated against the field's type on write (numbers must parse, dates must be
ISO YYYY-MM-DD, select values must be one of the defined options). Writing a
blank value clears it.
"""
import logging
import re
from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

import supabase_client as sb
from auth import OrgContext, require_org, sb_error

logger = logging.getLogger("custom_fields")

router = APIRouter(prefix="/api/custom-fields", tags=["custom-fields"])
# Lead-scoped values — same auth, mounted under /api/leads.
values_router = APIRouter(prefix="/api/leads", tags=["custom-fields"])

FIELD_TYPES = ("text", "number", "date", "select")
FIELD_KEY_RE = re.compile(r"^[a-z][a-z0-9_]{0,49}$")
ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MAX_OPTIONS = 100
MAX_VALUE = 5_000


def _clean_options(opts: Optional[List[str]]) -> List[str]:
    """De-dupe, trim, drop blanks, cap length. Order preserved."""
    out: List[str] = []
    for o in opts or []:
        s = str(o).strip()
        if s and s not in out:
            out.append(s)
    return out[:MAX_OPTIONS]


class FieldDefOut(BaseModel):
    id: str
    org_id: Optional[str] = None
    field_key: str
    label: str
    field_type: str
    options: List[str] = Field(default_factory=list)
    created_at: Optional[str] = None


class FieldDefIn(BaseModel):
    field_key: str = Field(min_length=1, max_length=50)
    label: str = Field(min_length=1, max_length=100)
    field_type: str = "text"
    options: List[str] = Field(default_factory=list)

    @field_validator("field_key")
    @classmethod
    def _key(cls, v: str) -> str:
        v = v.strip().lower()
        if not FIELD_KEY_RE.match(v):
            raise ValueError("field_key must be lower_snake_case, starting with a letter")
        return v

    @field_validator("label")
    @classmethod
    def _label(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("label can't be blank")
        return v

    @field_validator("field_type")
    @classmethod
    def _type(cls, v: str) -> str:
        v = (v or "text").strip().lower()
        if v not in FIELD_TYPES:
            raise ValueError(f"field_type must be one of {FIELD_TYPES}")
        return v

    def cleaned(self) -> dict:
        opts = _clean_options(self.options) if self.field_type == "select" else []
        if self.field_type == "select" and not opts:
            raise HTTPException(status_code=422, detail="A select field needs at least one option.")
        return {
            "field_key": self.field_key,
            "label": self.label,
            "field_type": self.field_type,
            "options": opts,
        }


class FieldDefPatch(BaseModel):
    """Edit a definition. field_key and field_type are immutable — only the label
    and (for select fields) the options can change."""
    label: Optional[str] = Field(default=None, max_length=100)
    options: Optional[List[str]] = None

    @field_validator("label")
    @classmethod
    def _label(cls, v):
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("label can't be blank")
        return v


class ValueIn(BaseModel):
    value: str = Field(default="", max_length=MAX_VALUE)


class LeadFieldOut(BaseModel):
    """A field definition merged with this lead's current value for it."""
    field_def_id: str
    field_key: str
    label: str
    field_type: str
    options: List[str] = Field(default_factory=list)
    value: str = ""


# ── Definitions CRUD ─────────────────────────────────────────────────────────
@router.get("", response_model=List[FieldDefOut])
async def list_defs(ctx: OrgContext = Depends(require_org)):
    try:
        return await sb.list_custom_field_defs(org_id=ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)


@router.post("", response_model=FieldDefOut, status_code=201)
async def create_def(body: FieldDefIn, ctx: OrgContext = Depends(require_org)):
    row = {"org_id": ctx.org_id, **body.cleaned()}
    try:
        created = await sb.insert_custom_field_def(row, token=ctx.token)
    except sb.SupabaseError as e:
        if e.status == 409 or "duplicate" in (e.message or "").lower():
            raise HTTPException(status_code=409, detail="A field with that key already exists.")
        raise sb_error(e)
    except Exception as e:
        raise sb_error(e)
    if not created:
        raise HTTPException(status_code=500, detail="Could not create the field.")
    logger.info("[org %s] custom field %s created (%s)", ctx.org_id, created.get("id"), body.field_key)
    return created


@router.patch("/{def_id}", response_model=FieldDefOut)
async def update_def(def_id: str, body: FieldDefPatch, ctx: OrgContext = Depends(require_org)):
    # Options only make sense (and only get validated/stored) for select fields.
    existing = None
    fields: Dict[str, Any] = {}
    if body.label is not None:
        fields["label"] = body.label
    if body.options is not None:
        existing = await _get_def_or_404(def_id, ctx)
        if existing["field_type"] != "select":
            raise HTTPException(status_code=422, detail="Only select fields have options.")
        opts = _clean_options(body.options)
        if not opts:
            raise HTTPException(status_code=422, detail="A select field needs at least one option.")
        fields["options"] = opts
    if not fields:
        raise HTTPException(status_code=422, detail="Nothing to update.")
    try:
        updated = await sb.update_custom_field_def(def_id, fields, org_id=ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    if not updated:
        raise HTTPException(status_code=404, detail="Field not found")
    logger.info("[org %s] custom field %s updated", ctx.org_id, def_id)
    return updated


@router.delete("/{def_id}", status_code=204)
async def delete_def(def_id: str, ctx: OrgContext = Depends(require_org)):
    try:
        deleted = await sb.delete_custom_field_def(def_id, org_id=ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    if not deleted:
        raise HTTPException(status_code=404, detail="Field not found")
    logger.info("[org %s] custom field %s deleted", ctx.org_id, def_id)
    return None


# ── Lead values ──────────────────────────────────────────────────────────────
async def _get_def_or_404(def_id: str, ctx: OrgContext) -> Dict[str, Any]:
    defs = await sb.list_custom_field_defs(org_id=ctx.org_id, token=ctx.token)
    match = next((d for d in defs if d["id"] == def_id), None)
    if not match:
        raise HTTPException(status_code=404, detail="Field not found")
    return match


def _validate_value(field_type: str, value: str, options: List[str]) -> str:
    """Coerce/validate a raw text value against the field's declared type."""
    value = (value or "").strip()
    if not value:
        return ""
    if field_type == "number":
        try:
            float(value)
        except ValueError:
            raise HTTPException(status_code=422, detail="Value must be a number.")
    elif field_type == "date":
        if not ISO_DATE_RE.match(value):
            raise HTTPException(status_code=422, detail="Value must be a date (YYYY-MM-DD).")
        try:
            date.fromisoformat(value)
        except ValueError:
            raise HTTPException(status_code=422, detail="Value is not a valid date.")
    elif field_type == "select":
        if value not in options:
            raise HTTPException(status_code=422, detail="Value must be one of the field's options.")
    return value


async def _merged_fields(lead_id: str, ctx: OrgContext) -> List[Dict[str, Any]]:
    """Every org field definition, each with this lead's value (or '' if unset)."""
    defs = await sb.list_custom_field_defs(org_id=ctx.org_id, token=ctx.token)
    values = await sb.list_lead_custom_values(lead_id, org_id=ctx.org_id, token=ctx.token)
    by_def = {v["field_def_id"]: v.get("value", "") for v in values}
    return [
        {
            "field_def_id": d["id"],
            "field_key": d["field_key"],
            "label": d["label"],
            "field_type": d["field_type"],
            "options": d.get("options") or [],
            "value": by_def.get(d["id"], ""),
        }
        for d in defs
    ]


@values_router.get("/{lead_id}/custom-fields", response_model=List[LeadFieldOut])
async def get_lead_fields(lead_id: str, ctx: OrgContext = Depends(require_org)):
    try:
        lead = await sb.get_lead(lead_id, token=ctx.token, org_id=ctx.org_id)
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")
        return await _merged_fields(lead_id, ctx)
    except HTTPException:
        raise
    except Exception as e:
        raise sb_error(e)


@values_router.put("/{lead_id}/custom-fields/{def_id}", response_model=List[LeadFieldOut])
async def set_lead_field(
    lead_id: str, def_id: str, body: ValueIn, ctx: OrgContext = Depends(require_org)
):
    """Set (or clear) one custom field on a lead, then return the merged set.
    A blank value deletes the stored value rather than storing an empty row."""
    try:
        lead = await sb.get_lead(lead_id, token=ctx.token, org_id=ctx.org_id)
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")
        field = await _get_def_or_404(def_id, ctx)
        value = _validate_value(field["field_type"], body.value, field.get("options") or [])
        if value:
            await sb.upsert_lead_custom_value(lead_id, def_id, value, ctx.org_id, token=ctx.token)
        else:
            await sb.delete_lead_custom_value(lead_id, def_id, org_id=ctx.org_id, token=ctx.token)
        return await _merged_fields(lead_id, ctx)
    except HTTPException:
        raise
    except Exception as e:
        raise sb_error(e)
