"""
Lead notes: free-text notes a team leaves on a lead.

Authenticated and org-scoped. Reads and writes run in USER mode, so Postgres RLS
(org_isolation on lead_notes) is the real boundary. The author is taken from the
verified JWT (ctx.user_id), never from the request body, and each note carries
the author's email (resolved server-side) so the UI can show who wrote it.

  GET    /api/leads/{lead_id}/notes            list a lead's notes (newest first)
  POST   /api/leads/{lead_id}/notes            add a note  {body}
  DELETE /api/leads/{lead_id}/notes/{note_id}  delete a note

Notes also surface in the lead's activity timeline (see leads.get_lead_activity).
"""
import logging
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

import supabase_client as sb
from auth import OrgContext, require_org, sb_error

logger = logging.getLogger("notes")
router = APIRouter(prefix="/api/leads", tags=["notes"])

MAX_BODY = 10_000


class NoteOut(BaseModel):
    id: str
    org_id: Optional[str] = None
    lead_id: str
    author_user_id: Optional[str] = None
    author_email: Optional[str] = None
    body: str
    created_at: Optional[str] = None


class NoteIn(BaseModel):
    body: str = Field(min_length=1, max_length=MAX_BODY)

    @field_validator("body")
    @classmethod
    def _clean(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("note can't be blank")
        return v


async def _attach_authors(notes: List[Dict]) -> List[Dict]:
    """Resolve each distinct author id to an email for display. Best-effort:
    auth.users isn't reachable through PostgREST, so we use the admin API, and a
    lookup failure just leaves author_email null rather than failing the request."""
    ids = {n.get("author_user_id") for n in notes if n.get("author_user_id")}
    emails: Dict[str, Optional[str]] = {}
    for uid in ids:
        try:
            user = await sb.admin_get_user(uid)
            emails[uid] = (user or {}).get("email")
        except Exception:
            emails[uid] = None
    for n in notes:
        n["author_email"] = emails.get(n.get("author_user_id"))
    return notes


@router.get("/{lead_id}/notes", response_model=List[NoteOut])
async def list_notes(lead_id: str, ctx: OrgContext = Depends(require_org)):
    try:
        lead = await sb.get_lead(lead_id, token=ctx.token, org_id=ctx.org_id)
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")
        notes = await sb.list_lead_notes(lead_id, org_id=ctx.org_id, token=ctx.token)
    except HTTPException:
        raise
    except Exception as e:
        raise sb_error(e)
    return await _attach_authors(notes)


@router.post("/{lead_id}/notes", response_model=NoteOut, status_code=201)
async def create_note(lead_id: str, body: NoteIn, ctx: OrgContext = Depends(require_org)):
    # Verify the lead is the caller's before writing — a cross-org id 404s.
    try:
        lead = await sb.get_lead(lead_id, token=ctx.token, org_id=ctx.org_id)
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")
        row = {
            "org_id": ctx.org_id,
            "lead_id": lead_id,
            "author_user_id": ctx.user_id,
            "body": body.body,
        }
        created = await sb.insert_lead_note(row, token=ctx.token)
    except HTTPException:
        raise
    except Exception as e:
        raise sb_error(e)
    if not created:
        raise HTTPException(status_code=500, detail="Could not add the note.")
    logger.info("[org %s] note %s added to lead %s", ctx.org_id, created.get("id"), lead_id)
    created["author_email"] = ctx.principal.email
    return created


@router.delete("/{lead_id}/notes/{note_id}", status_code=204)
async def delete_note(lead_id: str, note_id: str, ctx: OrgContext = Depends(require_org)):
    try:
        deleted = await sb.delete_lead_note(note_id, org_id=ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    if not deleted:
        raise HTTPException(status_code=404, detail="Note not found")
    logger.info("[org %s] note %s deleted", ctx.org_id, note_id)
    return None
