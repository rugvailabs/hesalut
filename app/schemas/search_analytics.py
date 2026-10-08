"""Wire shapes for search click tracking and placement analytics."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

Tier = Literal["annual", "monthly", "basic", "none"]


class ClickIn(BaseModel):
    search_id: uuid.UUID
    business_id: int = Field(gt=0)
    action: Literal["view", "call", "enquire"]


class ClickRecorded(BaseModel):
    # False when this result had already been clicked, or was never shown.
    recorded: bool


class TierPerformance(BaseModel):
    tier: Tier
    impressions: int
    clicks: int
    ctr: float
    avg_position: float


class RotationSubscriber(BaseModel):
    business_id: int
    name: str
    impressions: int
    leader_impressions: int
    leader_share: float
    clicks: int
    ctr: float


class RotationFairness(BaseModel):
    subscribers: list[RotationSubscriber]
    # Lowest leader share / highest, among subscribers seen 10+ times.
    fairness: float | None
    compared: int


class TopPerformer(BaseModel):
    business_id: int
    name: str
    tier: Tier
    impressions: int
    clicks: int
    ctr: float


class SearchAnalytics(BaseModel):
    days: int
    tiers: list[TierPerformance]
    rotation: RotationFairness
    top_performers: list[TopPerformer]


class DailyPerformance(BaseModel):
    day: date
    impressions: int
    clicks: int


class BusinessSearchPerformance(BaseModel):
    business_id: int
    days: int
    impressions: int
    clicks: int
    ctr: float
    avg_position: float | None
    clicks_by_action: dict[str, int]
    # Clicks on the external "Book online" button, from any page.
    booking_clicks: int = 0
    impressions_by_tier: dict[str, int]
    daily: list[DailyPerformance]
