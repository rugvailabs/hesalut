"""Smart search, layer 1: turn a plain-language query into search filters.

    "my sink is clogged in Burnaby, open now"
        -> category plumbers, city Burnaby, hours open_now

    understand(db, q, lang)   the whole thing; never raises for a normal query

The model only chooses filters. Ranking, paid placement and its labels stay in
the ordinary search (app/services/priority_search.py), which the caller runs
with these filters - so a smart search can never reorder or hide a paid
listing differently from a hand-filtered one.

Everything degrades to plain keyword search, with the query as typed:
  - no Anthropic key, or smart search switched off
  - the service-wide per-minute budget is spent (the endpoint is public, so a
    flood of unique queries must not become an unbounded bill)
  - the model is slow, errors, refuses, or answers with nothing usable

Results are cached in-process by (language, normalised query), and a query
that is just a category's name ("plumbers", "Dentists") is answered without a
model call at all.
"""

from __future__ import annotations

import logging
import re
import threading
import time
import unicodedata
from collections import OrderedDict
from typing import Literal

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.visibility import visible_businesses
from app.models.business import Business
from app.models.category import Category
from app.schemas.smart_search import UnderstandResponse
from app.services import llm

logger = logging.getLogger(__name__)

Hours = Literal["open_now", "weekends", "evenings"]
Price = Literal["$", "$$", "$$$", "$$$$"]

# The start of a Canadian postal code: A1A, A1A1, A1A1A or A1A1A1.
POSTAL_PREFIX = re.compile(r"[A-Z]\d[A-Z](\d([A-Z]\d?)?)?")

#: A minimum rating becomes the rating bands at or above it, which is what the
#: search's rating filter takes (priority_search.RATING_BANDS).
BANDS_AT_LEAST = {
    "5": ["5"],
    "4.5": ["4.5", "5"],
    "4": ["4", "4.5", "5"],
    "3": ["3", "4", "4.5", "5"],
}


class SearchIntent(BaseModel):
    """What the model returns. Checked again against the catalogue afterwards."""

    category_slugs: list[str] = Field(
        description="Slugs from the category list that fit the request. Usually one; "
        "more only when the request genuinely spans several. Empty if none fit."
    )
    cities: list[str] = Field(
        description="Cities from the city list the user named. Empty if none."
    )
    postal_code: str | None = Field(
        description="A Canadian postal code or its first three characters, if given."
    )
    near_me: bool = Field(
        description="True when the user wants places close to them "
        "(near me, nearby, close by, près de moi, à proximité)."
    )
    hours: list[Hours] = Field(
        description="open_now for now/today/right away/tonight-if-now; weekends for "
        "Saturday/Sunday; evenings for late/after work/after 8 pm."
    )
    min_rating: Literal["any", "3", "4", "4.5", "5"] = Field(
        description="Only when the user asks for well-rated places: 'best'/'top rated' "
        "-> 4.5, 'good reviews' -> 4. Otherwise any."
    )
    price_levels: list[Price] = Field(
        description="cheap/affordable/pas cher -> $ and $$; upscale/luxury -> $$$ and $$$$."
    )
    bookable: bool = Field(
        default=False,
        description="True only when the user wants to book, reserve or make an "
        "appointment online ('book online', 'can I book', 'réserver en ligne', "
        "'prendre rendez-vous en ligne'). Not for wanting a trade or an appointment "
        "in general, a specific time, or same-day availability.",
    )
    keywords: str | None = Field(
        description="Only a specific business name, brand or product worth matching "
        "literally. Never a category word, a place, or a word already turned into a filter."
    )
    unsupported: list[str] = Field(
        description="Short phrases, in the user's language, for things they asked for "
        "that none of these filters can express (a language spoken, same-day "
        "availability, a place not in the city list, insurance accepted...)."
    )
    summary: str = Field(
        description="A short phrase in the user's language describing the search, "
        "e.g. 'Plumbers in Burnaby, open now' / 'Plombiers à Burnaby, ouverts maintenant'."
    )


SYSTEM_INSTRUCTIONS = """\
You turn one search typed into a Canadian local-business directory into search filters.

The user may write in English or French, casually, with typos, or describe a problem
instead of naming a trade ("my sink is clogged" means plumbers; "mal de dos" could mean
chiropractors, physiotherapy or massage therapy). Pick the categories a person with that
need would actually want - usually one.

Use only the category slugs and city names listed below. If the user names a place that
is not in the city list, do not invent a filter for it: add it to `unsupported`
instead (for example "in Montreal").

Never put a word into `keywords` that you already turned into a category, city, hours,
rating, price or bookable filter. Most searches have no keywords.

Set `bookable` only when the user wants to book, reserve or make an appointment online
("book online", "can I book", "réserver en ligne", "prendre rendez-vous en ligne"). It
limits the results to businesses that take bookings on this site or through their own
booking page. Wanting a trade, or an appointment in general, is not a bookable search;
neither is asking for a particular time or same-day availability (that goes in
`unsupported`, as below). Never put booking words ("book", "booking", "reserve",
"appointment") into `keywords`.

The directory currently has no data on languages spoken, appointment availability,
insurance or payment methods accepted, or accessibility, so requests like those go in
`unsupported`, phrased briefly in the user's language.
"""


# --------------------------------------------------------------------- caches

class _TTLCache:
    """A small thread-safe LRU with expiry. Endpoints run in a thread pool."""

    def __init__(self, max_items: int) -> None:
        self._items: OrderedDict[tuple[str, str], tuple[float, UnderstandResponse]] = OrderedDict()
        self._max = max_items
        self._lock = threading.Lock()

    def get(self, key: tuple[str, str]) -> UnderstandResponse | None:
        with self._lock:
            hit = self._items.get(key)
            if hit is None:
                return None
            expires, value = hit
            if expires < time.monotonic():
                del self._items[key]
                return None
            self._items.move_to_end(key)
            return value

    def put(self, key: tuple[str, str], value: UnderstandResponse, ttl: float) -> None:
        with self._lock:
            self._items[key] = (time.monotonic() + ttl, value)
            self._items.move_to_end(key)
            while len(self._items) > self._max:
                self._items.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._items.clear()


class _MinuteBudget:
    """At most `limit` AI calls per wall-clock minute, across the whole process."""

    def __init__(self) -> None:
        self._minute = -1
        self._used = 0
        self._lock = threading.Lock()

    def take(self, limit: int) -> bool:
        with self._lock:
            minute = int(time.time() // 60)
            if minute != self._minute:
                self._minute, self._used = minute, 0
            if self._used >= limit:
                return False
            self._used += 1
            return True


_cache = _TTLCache(max_items=2000)
_budget = _MinuteBudget()


def reset_caches() -> None:
    """For tests."""
    _cache.clear()
    global _budget
    _budget = _MinuteBudget()


# ------------------------------------------------------------------ catalogue

def _fold(text: str) -> str:
    """Lowercase, strip accents and collapse spaces: 'Électriciens ' -> 'electriciens'."""
    decomposed = unicodedata.normalize("NFKD", text)
    stripped = "".join(c for c in decomposed if not unicodedata.combining(c))
    return " ".join(stripped.lower().split())


def _catalogue(db: Session) -> tuple[list[Category], list[str]]:
    """Every root category, and every city that has a public listing."""
    categories = list(
        db.scalars(
            select(Category)
            .where(Category.parent_id.is_(None))
            .order_by(Category.sort_order, Category.name)
        ).all()
    )
    cities = list(
        db.scalars(visible_businesses(Business.city).distinct().order_by(Business.city)).all()
    )
    return categories, [c for c in cities if c]


def _catalogue_text(categories: list[Category], cities: list[str]) -> str:
    lines = ["Categories (slug | name | what it covers):"]
    for c in categories:
        lines.append(f"- {c.slug} | {c.name} | {c.description or ''}".rstrip(" |"))
    lines.append("")
    lines.append("Cities with listings: " + ", ".join(cities))
    return "\n".join(lines)


# ------------------------------------------------------------------- results

def fallback(q: str) -> UnderstandResponse:
    """Plain keyword search with the query exactly as typed."""
    text = " ".join(q.split())
    return UnderstandResponse(source="keywords", keywords=text or None, summary=text)


def _category_shortcut(q: str, categories: list[Category]) -> UnderstandResponse | None:
    """A query that is just one category's name or slug needs no model."""
    folded = _fold(q)
    for c in categories:
        names = {_fold(c.name), _fold(c.slug.replace("-", " "))}
        # "plumber" for "Plumbers": a trailing s is the only inflection worth
        # handling here; anything more interesting goes to the model.
        names |= {n[:-1] for n in names if n.endswith("s")}
        if folded in names:
            return UnderstandResponse(
                source="ai", category_slugs=[c.slug], summary=c.name
            )
    return None


def _validated(
    intent: SearchIntent, categories: list[Category], cities: list[str]
) -> UnderstandResponse:
    """Keep only what the catalogue actually has; the model is not trusted blindly."""
    known_slugs = {c.slug for c in categories}
    slugs = list(dict.fromkeys(s for s in intent.category_slugs if s in known_slugs))

    by_folded = {_fold(city): city for city in cities}
    matched_cities: list[str] = []
    unsupported = [u.strip() for u in intent.unsupported if u and u.strip()]
    for city in intent.cities:
        canonical = by_folded.get(_fold(city))
        if canonical is None:
            unsupported.append(city)
        elif canonical not in matched_cities:
            matched_cities.append(canonical)

    postal = "".join((intent.postal_code or "").upper().split())
    postal_code = postal if POSTAL_PREFIX.fullmatch(postal) else None

    keywords = " ".join((intent.keywords or "").split()) or None

    return UnderstandResponse(
        source="ai",
        category_slugs=slugs,
        cities=matched_cities,
        postal_code=postal_code,
        near_me=intent.near_me,
        hours=list(dict.fromkeys(intent.hours)),
        rating_bands=BANDS_AT_LEAST.get(intent.min_rating, []),
        price_levels=list(dict.fromkeys(intent.price_levels)),
        bookable=intent.bookable,
        keywords=keywords,
        unsupported=list(dict.fromkeys(unsupported)),
        summary=" ".join(intent.summary.split()),
    )


def _is_empty(result: UnderstandResponse) -> bool:
    """Nothing to search on - the model understood nothing it could use."""
    return not (
        result.category_slugs
        or result.cities
        or result.postal_code
        or result.near_me
        or result.hours
        or result.rating_bands
        or result.price_levels
        or result.bookable
        or result.keywords
    )


def understand(db: Session, q: str, lang: str = "en") -> UnderstandResponse:
    """Filters for a plain-language query. Falls back to keywords; never raises."""
    settings = get_settings()
    text = " ".join(q.split())[:300]
    lang = "fr" if lang == "fr" else "en"
    if len(text) < 2:
        return fallback(text)

    key = (lang, _fold(text))
    cached = _cache.get(key)
    if cached is not None:
        return cached

    try:
        categories, cities = _catalogue(db)
    except Exception:  # noqa: BLE001 - a search must never fail on this step
        logger.exception("smart search: could not load the catalogue")
        return fallback(text)

    shortcut = _category_shortcut(text, categories)
    if shortcut is not None:
        _cache.put(key, shortcut, settings.smart_search_cache_ttl_seconds)
        return shortcut

    if not (settings.smart_search_enabled and llm.is_configured()):
        return fallback(text)
    if not _budget.take(settings.smart_search_max_ai_calls_per_minute):
        logger.warning("smart search: per-minute AI budget spent; using keywords")
        return fallback(text)

    try:
        intent = llm.parse(
            label="smart_search",
            # Instructions, then the catalogue: both identical across queries,
            # so the whole system prompt is a stable, cacheable prefix.
            system=SYSTEM_INSTRUCTIONS + "\n" + _catalogue_text(categories, cities),
            user=f"Interface language: {lang}\nSearch: {text}",
            output_format=SearchIntent,
            model=settings.search_llm_model,
            effort=settings.search_llm_effort,
            max_tokens=settings.search_llm_max_tokens,
            timeout=settings.search_llm_timeout_seconds,
            max_retries=1,
        )
    except (llm.LLMUnavailable, llm.LLMTransient) as exc:
        logger.warning("smart search: falling back to keywords (%s)", exc)
        return fallback(text)
    except Exception:  # noqa: BLE001 - never let search 500 on the AI step
        logger.exception("smart search: unexpected error; using keywords")
        return fallback(text)

    result = _validated(intent, categories, cities)
    if _is_empty(result):
        # Keep what the model could not express, so the page can still say so.
        result = fallback(text).model_copy(update={"unsupported": result.unsupported})
    _cache.put(key, result, settings.smart_search_cache_ttl_seconds)
    return result


__all__ = ["SearchIntent", "understand", "fallback", "reset_caches"]
