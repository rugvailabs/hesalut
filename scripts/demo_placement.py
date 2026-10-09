"""Give a few seeded listings subscriptions, so search placement is visible locally.

The seeded catalogue has no subscriptions, so every listing sits in the "no
plan" tier and search looks unchanged. This puts some Vancouver plumbers and
electricians on Annual, Monthly and Basic plans. Local demo data only: the
rows are marked `demo_placement_*` and --undo removes exactly those.

    docker exec hesalut_backend python -m scripts.demo_placement
    docker exec hesalut_backend python -m scripts.demo_placement --undo
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select

from app.core.db import SessionLocal
from app.models.business import Business
from app.models.subscription import Plan, Subscription, SubscriptionStatus

MARK = "demo_placement_"

# slug -> plan name
DEMO = {
    "kitsilano-drain-works": "Annual",
    "commercial-drive-pipe-co": "Monthly",
    "north-shore-plumbing-group": "Monthly",
    "richmond-flow-services": "Monthly",
    "coal-harbour-plumbing": "Basic",
    "yaletown-electrical": "Annual",
    "burnaby-voltage": "Monthly",
    "surrey-current-co": "Basic",
}


def apply() -> None:
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        plans = {p.name: p for p in db.scalars(select(Plan)).all()}
        for slug, plan_name in DEMO.items():
            business = db.scalar(select(Business).where(Business.slug == slug))
            if business is None:
                print(f"  skip {slug}: not in this database")
                continue
            marker = f"{MARK}{slug}"
            if db.scalar(select(Subscription).where(Subscription.gateway_subscription_id == marker)):
                print(f"  keep {slug}: already on {plan_name}")
                continue
            plan = plans[plan_name]
            days = {"Annual": 365, "Monthly": 30}.get(plan_name)
            db.add(
                Subscription(
                    business_id=business.id,
                    plan_id=plan.id,
                    status=SubscriptionStatus.active,
                    gateway_subscription_id=marker,
                    current_period_end=now + timedelta(days=days) if days else None,
                )
            )
            print(f"  add  {slug}: {plan_name}")
        db.commit()


def undo() -> None:
    with SessionLocal() as db:
        result = db.execute(
            delete(Subscription).where(Subscription.gateway_subscription_id.like(f"{MARK}%"))
        )
        db.commit()
        print(f"  removed {result.rowcount} demo subscriptions")


if __name__ == "__main__":
    undo() if "--undo" in sys.argv else apply()
