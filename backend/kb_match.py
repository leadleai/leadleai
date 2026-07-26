"""
Rule-based matching of a lead's enquiry to a knowledge-base entry.

No AI, no network. Each KB entry carries a list of `keywords` the org defines
(e.g. ["price", "pricing", "cost", "how much"]). We score every entry by how many
of its keywords appear in the enquiry text and return the highest scorer; if
nothing scores above zero we return None and the caller keeps the plain template.

Matching is case-insensitive and whole-word: "price" matches "what's the price?"
but not "pricey". Multi-word keywords ("how much") match as a phrase with flexible
whitespace. Keywords made only of punctuation fall back to a plain substring test.

Toggle with KB_MATCHING_ENABLED (default true) — off means plain templates.
"""
import logging
import os
import re
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any, Dict, List, Optional

logger = logging.getLogger("kb_match")


def kb_matching_enabled() -> bool:
    """Read at call time (not import) so it can be flipped without code changes."""
    return os.environ.get("KB_MATCHING_ENABLED", "true").strip().lower() in (
        "1", "true", "yes", "on",
    )


@dataclass
class MatchResult:
    entry: Dict[str, Any]
    score: int
    matched_keywords: List[str] = field(default_factory=list)

    @property
    def entry_id(self) -> Optional[str]:
        return self.entry.get("id")

    @property
    def title(self) -> str:
        return (self.entry.get("title") or "").strip()

    @property
    def content(self) -> str:
        return (self.entry.get("content") or "").strip()


def normalize_keywords(raw: Any) -> List[str]:
    """Accept a text[] (list) or a comma-separated string — or a list whose items
    themselves contain commas — and return clean, lowercased, de-duplicated,
    non-empty keywords (order preserved)."""
    if raw is None:
        return []
    items = [raw] if isinstance(raw, str) else list(raw)
    seen: set = set()
    out: List[str] = []
    for item in items:
        for part in str(item or "").split(","):  # split every item on commas too
            kw = part.strip().lower()
            if kw and kw not in seen:
                seen.add(kw)
                out.append(kw)
    return out


@lru_cache(maxsize=2048)
def _compile(keyword: str) -> re.Pattern:
    """Whole-word / phrase regex for a keyword. Word boundaries are applied only
    where the keyword edge is alphanumeric, so punctuation-only keywords still work.
    Cached because the same keywords are matched across many leads."""
    tokens = keyword.split()
    if not tokens:
        return re.compile(re.escape(keyword))
    body = r"\s+".join(re.escape(t) for t in tokens)
    left = r"\b" if tokens[0][:1].isalnum() else ""
    right = r"\b" if tokens[-1][-1:].isalnum() else ""
    return re.compile(left + body + right, re.IGNORECASE)


def score_entry(enquiry_lower: str, entry: Dict[str, Any]) -> MatchResult:
    """How many of this entry's keywords appear in the (already-lowercased) enquiry."""
    hits: List[str] = []
    for kw in normalize_keywords(entry.get("keywords")):
        if _compile(kw).search(enquiry_lower):
            hits.append(kw)
    return MatchResult(entry=entry, score=len(hits), matched_keywords=hits)


def match(enquiry: str, entries: List[Dict[str, Any]]) -> Optional[MatchResult]:
    """Best-matching entry for the enquiry, or None if nothing scores above zero.

    Ties are broken by input order (the caller lists newest-edited first), so the
    most recently tuned entry wins a tie."""
    text = (enquiry or "").lower()
    if not text.strip():
        return None
    best: Optional[MatchResult] = None
    for entry in entries or []:
        result = score_entry(text, entry)
        if result.score > 0 and (best is None or result.score > best.score):
            best = result
    return best
