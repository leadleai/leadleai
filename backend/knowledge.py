"""
Per-org knowledge base CRUD. Every route is authenticated and org-scoped: reads
and writes run in USER mode, so Postgres RLS (org_isolation on knowledge_base) is
the real boundary — a member of another org can never see or touch these rows.

  GET    /api/knowledge          list this org's entries (newest edit first)
  POST   /api/knowledge          add an entry
  PATCH  /api/knowledge/{id}     edit title/content
  DELETE /api/knowledge/{id}     remove an entry

The AI follow-up writer (backend/ai_email.py) is grounded ONLY in these entries.
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import kb_match
import supabase_client as sb
from auth import OrgContext, require_org, sb_error

logger = logging.getLogger("knowledge")
router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])

MAX_CONTENT = 100_000  # generous; a KB entry is text, not a document store
MAX_KEYWORDS = 100


class KnowledgeOut(BaseModel):
    id: str
    org_id: Optional[str] = None
    title: str = ""
    content: str = ""
    keywords: List[str] = Field(default_factory=list)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class KnowledgeIn(BaseModel):
    title: str = Field(default="", max_length=200)
    content: str = Field(min_length=1, max_length=MAX_CONTENT)
    # Keywords the enquiry is matched against. Accepts an array OR a comma string.
    keywords: List[str] = Field(default_factory=list)

    def cleaned(self) -> dict:
        return {
            "title": self.title.strip(),
            "content": self.content.strip(),
            "keywords": kb_match.normalize_keywords(self.keywords)[:MAX_KEYWORDS],
        }


class Knowledgepatch(BaseModel):
    """PATCH: every field optional, but at least one must be present."""
    title: Optional[str] = Field(default=None, max_length=200)
    content: Optional[str] = Field(default=None, max_length=MAX_CONTENT)
    keywords: Optional[List[str]] = None

    def cleaned(self) -> dict:
        fields = {}
        if self.title is not None:
            fields["title"] = self.title.strip()
        if self.content is not None:
            fields["content"] = self.content.strip()
        if self.keywords is not None:
            fields["keywords"] = kb_match.normalize_keywords(self.keywords)[:MAX_KEYWORDS]
        return fields


class TestMatchIn(BaseModel):
    enquiry: str = Field(min_length=1, max_length=MAX_CONTENT)


class TestMatchOut(BaseModel):
    matched: bool
    enabled: bool                       # KB_MATCHING_ENABLED
    entry_id: Optional[str] = None
    title: Optional[str] = None
    score: int = 0
    matched_keywords: List[str] = Field(default_factory=list)


@router.get("", response_model=List[KnowledgeOut])
async def list_knowledge(ctx: OrgContext = Depends(require_org)):
    try:
        return await sb.list_knowledge(org_id=ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)


@router.post("/test-match", response_model=TestMatchOut)
async def test_match(body: TestMatchIn, ctx: OrgContext = Depends(require_org)):
    """Tune keywords without sending: which KB entry would this enquiry match?
    Runs the exact same matcher the drip uses. Doesn't depend on the toggle, but
    reports it so the UI can warn when matching is globally off."""
    try:
        entries = await sb.list_knowledge(org_id=ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    result = kb_match.match(body.enquiry, entries)
    if not result:
        return TestMatchOut(matched=False, enabled=kb_match.kb_matching_enabled())
    return TestMatchOut(
        matched=True,
        enabled=kb_match.kb_matching_enabled(),
        entry_id=result.entry_id,
        title=result.title or "(untitled)",
        score=result.score,
        matched_keywords=result.matched_keywords,
    )


@router.post("", response_model=KnowledgeOut, status_code=201)
async def create_knowledge(body: KnowledgeIn, ctx: OrgContext = Depends(require_org)):
    row = {"org_id": ctx.org_id, **body.cleaned()}
    try:
        created = await sb.insert_knowledge(row, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    if not created:
        raise HTTPException(status_code=500, detail="Could not create the entry.")
    logger.info("[org %s] knowledge entry %s created", ctx.org_id, created.get("id"))
    return created


@router.patch("/{entry_id}", response_model=KnowledgeOut)
async def update_knowledge(entry_id: str, body: Knowledgepatch, ctx: OrgContext = Depends(require_org)):
    fields = body.cleaned()
    if not fields:
        raise HTTPException(status_code=422, detail="Nothing to update.")
    if "content" in fields and not fields["content"]:
        raise HTTPException(status_code=422, detail="Content can't be empty.")
    try:
        updated = await sb.update_knowledge(entry_id, fields, org_id=ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    if not updated:
        # Missing OR another org's row — same 404 either way, leaking nothing.
        raise HTTPException(status_code=404, detail="Entry not found")
    logger.info("[org %s] knowledge entry %s updated", ctx.org_id, entry_id)
    return updated


@router.delete("/{entry_id}", status_code=204)
async def delete_knowledge(entry_id: str, ctx: OrgContext = Depends(require_org)):
    try:
        deleted = await sb.delete_knowledge(entry_id, org_id=ctx.org_id, token=ctx.token)
    except Exception as e:
        raise sb_error(e)
    if not deleted:
        raise HTTPException(status_code=404, detail="Entry not found")
    logger.info("[org %s] knowledge entry %s deleted", ctx.org_id, entry_id)
    return None
