"""Smart search, layer 1: plain-language query -> filters.

The model and the catalogue are stubbed, so these check our side of the
contract - validation against the catalogue, every fallback path, the cache
and the spend budget - without a database or an API key. They need no
fixtures from conftest.py, so they also run with `pytest --noconftest`.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services import llm, query_understanding as qu
from app.services.query_understanding import SearchIntent

CATEGORIES = [
    SimpleNamespace(slug="plumbers", name="Plumbers", description="Leaks, drains"),
    SimpleNamespace(slug="dentists", name="Dentists", description="Teeth"),
    SimpleNamespace(slug="walk-in-clinics", name="Doctors & Walk-in Clinics", description="GPs"),
]
CITIES = ["Burnaby", "Vancouver", "North Vancouver"]


def intent(**overrides) -> SearchIntent:
    values = dict(
        category_slugs=[],
        cities=[],
        postal_code=None,
        near_me=False,
        hours=[],
        min_rating="any",
        price_levels=[],
        keywords=None,
        unsupported=[],
        summary="",
    )
    values.update(overrides)
    return SearchIntent(**values)


@pytest.fixture(autouse=True)
def isolated(monkeypatch):
    qu.reset_caches()
    monkeypatch.setattr(qu, "_catalogue", lambda db: (CATEGORIES, CITIES))
    monkeypatch.setattr(llm, "is_configured", lambda: True)
    settings = SimpleNamespace(
        smart_search_enabled=True,
        search_llm_model="claude-opus-5-5",
        search_llm_effort="low",
        search_llm_max_tokens=4096,
        search_llm_timeout_seconds=12.0,
        smart_search_cache_ttl_seconds=3600,
        smart_search_max_ai_calls_per_minute=60,
    )
    monkeypatch.setattr(qu, "get_settings", lambda: settings)
    yield settings
    qu.reset_caches()


def model_returns(monkeypatch, result=None, error=None):
    calls = []

    def fake_parse(**kwargs):
        calls.append(kwargs)
        if error is not None:
            raise error
        return result

    monkeypatch.setattr(llm, "parse", fake_parse)
    return calls


def test_problem_description_becomes_filters(monkeypatch):
    calls = model_returns(
        monkeypatch,
        intent(
            category_slugs=["plumbers"],
            cities=["burnaby"],
            hours=["open_now"],
            summary="Plumbers in Burnaby, open now",
        ),
    )
    result = qu.understand(None, "my sink is clogged in burnaby, need someone now")

    assert result.source == "ai"
    assert result.category_slugs == ["plumbers"]
    assert result.cities == ["Burnaby"]  # canonical spelling from the catalogue
    assert result.hours == ["open_now"]
    assert result.keywords is None
    # The search's own settings reach the model call, not the pipeline's.
    assert calls[0]["model"] == "claude-opus-5-5"
    assert calls[0]["effort"] == "low"


def test_unknown_slugs_and_places_are_not_trusted(monkeypatch):
    model_returns(
        monkeypatch,
        intent(
            category_slugs=["plumbers", "astrologers"],
            cities=["Montreal"],
            unsupported=["parle pendjabi"],
            summary="Plombiers",
        ),
    )
    result = qu.understand(None, "plombier qui parle pendjabi à Montréal", "fr")

    assert result.category_slugs == ["plumbers"]
    assert result.cities == []
    assert result.unsupported == ["parle pendjabi", "Montreal"]


def test_minimum_rating_becomes_bands_and_postal_code_is_checked(monkeypatch):
    model_returns(
        monkeypatch,
        intent(category_slugs=["dentists"], min_rating="4.5", postal_code="v6b 1a1"),
    )
    result = qu.understand(None, "best dentist near V6B 1A1")
    assert result.rating_bands == ["4.5", "5"]
    assert result.postal_code == "V6B1A1"

    qu.reset_caches()
    model_returns(monkeypatch, intent(category_slugs=["dentists"], postal_code="12345"))
    assert qu.understand(None, "dentist 12345").postal_code is None


def test_category_name_is_answered_without_the_model(monkeypatch):
    calls = model_returns(monkeypatch, intent())
    for typed in ("Plumbers", "plumber", "  PLUMBERS "):
        result = qu.understand(None, typed)
        assert result.source == "ai" and result.category_slugs == ["plumbers"]
    assert calls == []


@pytest.mark.parametrize(
    "error", [llm.LLMUnavailable("no key"), llm.LLMTransient("429"), RuntimeError("boom")]
)
def test_any_model_failure_falls_back_to_keywords(monkeypatch, error):
    model_returns(monkeypatch, error=error)
    result = qu.understand(None, "sink clogged")
    assert result.source == "keywords"
    assert result.keywords == "sink clogged"
    assert result.category_slugs == []


def test_no_key_means_no_model_call(monkeypatch, isolated):
    monkeypatch.setattr(llm, "is_configured", lambda: False)
    calls = model_returns(monkeypatch, intent(category_slugs=["plumbers"]))
    assert qu.understand(None, "sink clogged").source == "keywords"
    assert calls == []


def test_switched_off_means_no_model_call(monkeypatch, isolated):
    isolated.smart_search_enabled = False
    calls = model_returns(monkeypatch, intent(category_slugs=["plumbers"]))
    assert qu.understand(None, "sink clogged").source == "keywords"
    assert calls == []


def test_an_empty_understanding_falls_back_but_keeps_the_caveats(monkeypatch):
    model_returns(monkeypatch, intent(unsupported=["available today"], summary="?"))
    result = qu.understand(None, "someone available today")
    assert result.source == "keywords"
    assert result.keywords == "someone available today"
    assert result.unsupported == ["available today"]


def test_results_are_cached_per_language(monkeypatch):
    calls = model_returns(monkeypatch, intent(category_slugs=["plumbers"], summary="Plumbers"))
    qu.understand(None, "Sink clogged")
    qu.understand(None, "sink   CLOGGED")  # same after normalising
    assert len(calls) == 1
    qu.understand(None, "sink clogged", "fr")
    assert len(calls) == 2


def test_budget_caps_model_calls_per_minute(monkeypatch, isolated):
    isolated.smart_search_max_ai_calls_per_minute = 2
    calls = model_returns(monkeypatch, intent(category_slugs=["plumbers"], summary="x"))
    results = [qu.understand(None, f"leaky pipe {i}") for i in range(4)]
    assert len(calls) == 2
    assert [r.source for r in results] == ["ai", "ai", "keywords", "keywords"]


def test_too_short_or_catalogue_failure_falls_back(monkeypatch):
    calls = model_returns(monkeypatch, intent(category_slugs=["plumbers"]))
    assert qu.understand(None, "a").source == "keywords"

    def broken(db):
        raise RuntimeError("db down")

    monkeypatch.setattr(qu, "_catalogue", broken)
    assert qu.understand(None, "leaky pipe").source == "keywords"
    assert calls == []


# ----------------------------------------------------------------- bookable
def test_a_request_to_book_online_becomes_the_bookable_filter(monkeypatch):
    calls = model_returns(
        monkeypatch,
        intent(category_slugs=["dentists"], bookable=True, summary="Dentists you can book online"),
    )
    result = qu.understand(None, "dentist I can book online")
    assert result.source == "ai" and result.category_slugs == ["dentists"]
    assert result.bookable is True
    assert result.keywords is None  # "book" must not also be searched as a word
    # The model is told what bookable means, and not to leak booking words into keywords.
    system = calls[0]["system"]
    assert "`bookable`" in system and "same-day availability" in system and '"book"' in system


def test_bookable_is_off_unless_the_model_asks_for_it(monkeypatch):
    model_returns(monkeypatch, intent(category_slugs=["dentists"], summary="Dentists"))
    assert qu.understand(None, "dentist appointment tomorrow morning").bookable is False


def test_a_search_that_is_only_bookable_is_still_a_search(monkeypatch):
    model_returns(monkeypatch, intent(bookable=True, summary="Businesses you can book online"))
    result = qu.understand(None, "places I can book online")
    assert result.source == "ai" and result.bookable is True  # not thrown away as "understood nothing"


def test_the_fallback_and_the_name_shortcut_are_never_bookable(monkeypatch):
    assert qu.fallback("book a plumber").bookable is False
    assert qu.understand(None, "Plumbers").bookable is False  # answered without the model
    model_returns(monkeypatch, error=llm.LLMUnavailable("no key"))
    assert qu.understand(None, "plumber I can book online").bookable is False  # model down: keywords


def test_the_response_shape_carries_the_flag():
    from app.schemas.smart_search import UnderstandResponse

    assert UnderstandResponse(source="keywords").bookable is False
    assert UnderstandResponse(source="ai", bookable=True).model_dump()["bookable"] is True
