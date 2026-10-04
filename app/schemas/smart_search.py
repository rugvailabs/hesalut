"""Smart search: what GET /search/understand returns.

The shape is also the contract the web and mobile clients code against, so a
field change here is a change there too.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class UnderstandResponse(BaseModel):
    #: "ai" when the filters came from understanding the query; "keywords"
    #: when the client should simply run a keyword search with `keywords`.
    source: Literal["ai", "keywords"]
    category_slugs: list[str] = []
    cities: list[str] = []
    postal_code: str | None = None
    near_me: bool = False
    hours: list[Literal["open_now", "weekends", "evenings"]] = []
    rating_bands: list[Literal["5", "4.5", "4", "3"]] = []
    price_levels: list[Literal["$", "$$", "$$$", "$$$$"]] = []
    keywords: str | None = None
    #: Things asked for that no filter can express yet, in the query's language.
    unsupported: list[str] = []
    #: A short description of the search, in the query's language.
    summary: str = ""
