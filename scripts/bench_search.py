"""Benchmark /businesses/search against a large synthetic directory.

Builds a separate `<db>_bench` database (never the dev one), migrates it,
fills it with synthetic listings around Metro Vancouver with a realistic mix of
subscriptions, then times representative searches through the real endpoint.

    docker exec hesalut_backend python -m scripts.bench_search --build 50000
    docker exec hesalut_backend python -m scripts.bench_search            # time only
    docker exec hesalut_backend python -m scripts.bench_search --explain  # query plan
    docker exec hesalut_backend python -m scripts.bench_search --drop

Nothing here runs in the app; it exists to measure the search query.
"""

from __future__ import annotations

import random
import statistics
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.core.db import get_db
from app.main import app

ROOT = Path(__file__).resolve().parent.parent
CATEGORIES = 12
QUERIES = {
    "near me, one category, 25 km": {"category_slug": "bench-3", "lat": 49.2827, "lng": -123.1207, "radius_km": 25},
    "near me, text query, 25 km": {"q": "plumb", "lat": 49.2827, "lng": -123.1207, "radius_km": 25},
    "category + city, no point": {"category_slug": "bench-5", "city": "Vancouver"},
    "category, sort by name, page 20": {"category_slug": "bench-7", "sort": "name", "page": 20},
}


def _urls() -> tuple[str, str]:
    base, _, name = get_settings().database_url.rpartition("/")
    return f"{base}/postgres", f"{base}/{name}_bench"


def build(n: int) -> None:
    admin_url, bench_url = _urls()
    admin = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    name = bench_url.rpartition("/")[2]
    with admin.connect() as conn:
        conn.execute(text(f'DROP DATABASE IF EXISTS "{name}"'))
        conn.execute(text(f'CREATE DATABASE "{name}"'))
    admin.dispose()

    cfg = Config(str(ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(ROOT / "alembic"))
    cfg.set_main_option("sqlalchemy.url", bench_url.replace("%", "%%"))
    command.upgrade(cfg, "head")

    rng = random.Random(42)
    engine = create_engine(bench_url)
    now = datetime.now(timezone.utc)
    cities = ["Vancouver", "Burnaby", "Richmond", "Surrey", "North Vancouver"]
    words = ["Plumbing", "Electric", "Dental", "Auto", "Fitness", "Kitchen", "Movers", "Legal"]
    with engine.begin() as conn:
        for i in range(CATEGORIES):
            conn.execute(text("INSERT INTO categories (name, slug) VALUES (:n, :s)"), {"n": f"Bench {i}", "s": f"bench-{i}"})
        cat_ids = [r[0] for r in conn.execute(text("SELECT id FROM categories WHERE slug LIKE 'bench-%' ORDER BY id"))]
        plans = dict(conn.execute(text("SELECT name, id FROM plans")).all())

        rows = []
        for i in range(n):
            rating = round(rng.uniform(2.5, 5.0), 1) if rng.random() > 0.1 else None
            rows.append({
                "name": f"{rng.choice(words)} Co {i}",
                "slug": f"bench-{i}",
                "category_id": rng.choice(cat_ids),
                "city": rng.choice(cities),
                "province": "BC",
                "lat": 49.0 + rng.uniform(0, 0.6),
                "lng": -123.4 + rng.uniform(0, 0.8),
                "rating": rating,
                "reviews": rng.randint(0, 300) if rating else 0,
                "created": now - timedelta(days=rng.randint(0, 1500)),
            })
        conn.execute(
            text(
                "INSERT INTO businesses (name, slug, category_id, city, province, latitude, longitude, "
                "rating, review_count, verified, is_active, status, created_at) VALUES "
                "(:name, :slug, :category_id, :city, :province, :lat, :lng, :rating, :reviews, true, true, "
                "'approved', :created)"
            ),
            rows,
        )
        conn.execute(text(
            "INSERT INTO business_verifications (business_id, email, mobile_number, status) "
            "SELECT id, 'kyc@example.ca', '6045550100', 'verified' FROM businesses"
        ))

        subs = []
        for (business_id,) in conn.execute(text("SELECT id FROM businesses")):
            roll = rng.random()
            if roll < 0.05:
                plan, end = plans["Annual"], now + timedelta(days=200)
            elif roll < 0.15:
                plan, end = plans["Monthly"], now + timedelta(days=15)
            elif roll < 0.45:
                plan, end = plans["Basic"], None
            elif roll < 0.50:
                plan, end = plans["Monthly"], now - timedelta(days=5)  # lapsed
            else:
                continue
            subs.append({"b": business_id, "p": plan, "e": end})
        conn.execute(
            text("INSERT INTO subscriptions (business_id, plan_id, status, current_period_end) VALUES (:b, :p, 'active', :e)"),
            subs,
        )
        conn.execute(text("ANALYZE"))
    engine.dispose()
    print(f"built {n} listings, {len(subs)} subscriptions")


def bench(explain: bool) -> None:
    _, bench_url = _urls()
    engine = create_engine(bench_url, pool_pre_ping=True)
    Session = sessionmaker(bind=engine)
    captured: list[str] = []

    def override():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    if explain:
        from sqlalchemy import event

        @event.listens_for(engine, "before_cursor_execute")
        def _capture(conn, cursor, statement, parameters, context, executemany):
            if "FROM businesses" in statement or "businesses." in statement:
                captured.append(cursor.mogrify(statement, parameters).decode())

    app.dependency_overrides[get_db] = override
    with TestClient(app) as client:
        for label, params in QUERIES.items():
            client.get("/api/v1/businesses/search", params=params)  # warm
            timings = []
            for _ in range(15):
                start = time.perf_counter()
                r = client.get("/api/v1/businesses/search", params=params)
                timings.append((time.perf_counter() - start) * 1000)
            assert r.status_code == 200, r.text
            body = r.json()
            print(
                f"{label:36s} median {statistics.median(timings):7.1f} ms   "
                f"p90 {sorted(timings)[int(len(timings) * 0.9) - 1]:7.1f} ms   total {body['total']}"
            )
    app.dependency_overrides.clear()

    if explain and captured:
        seen = set()
        with engine.connect() as conn:
            for sql in captured:
                if sql in seen:
                    continue
                seen.add(sql)
                print("\n" + "=" * 100)
                plan = conn.execute(text("EXPLAIN (ANALYZE, BUFFERS) " + sql)).scalars().all()
                print("\n".join(plan[-25:]))
                if len(seen) >= 3:
                    break
    engine.dispose()


def drop() -> None:
    admin_url, bench_url = _urls()
    admin = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(text(f'DROP DATABASE IF EXISTS "{bench_url.rpartition("/")[2]}"'))
    print("dropped")


if __name__ == "__main__":
    if "--drop" in sys.argv:
        drop()
    else:
        if "--build" in sys.argv:
            build(int(sys.argv[sys.argv.index("--build") + 1]))
        bench(explain="--explain" in sys.argv)
