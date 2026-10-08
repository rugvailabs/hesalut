"""Test fixtures.

Tests run against a dedicated `<db>_test` database created on demand, with the
app's get_db dependency overridden to point at it. Dev data is never touched.
"""

from __future__ import annotations

import re
import uuid
from pathlib import Path
from typing import Iterator

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

import app.models  # noqa: F401  - registers every table on Base.metadata
from app.core.config import get_settings
from app.core.db import get_db
from app.main import app

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _test_database_url() -> str:
    base, _, name = get_settings().database_url.rpartition("/")
    return f"{base}/{name}_test"


@pytest.fixture(scope="session")
def test_engine():
    url = _test_database_url()
    base, _, test_name = url.rpartition("/")

    # Rebuild the scratch DB from scratch each session and bring it up with
    # Alembic rather than create_all. create_all cannot ALTER an existing
    # table, so a new column would silently leave the test schema stale; going
    # through migrations also means every test run exercises them.
    # CREATE/DROP DATABASE cannot run inside a transaction, hence AUTOCOMMIT.
    admin = create_engine(f"{base}/postgres", isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(
            text(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                "WHERE datname = :n AND pid <> pg_backend_pid()"
            ),
            {"n": test_name},
        )
        conn.execute(text(f'DROP DATABASE IF EXISTS "{test_name}"'))
        conn.execute(text(f'CREATE DATABASE "{test_name}"'))
    admin.dispose()

    cfg = Config(str(PROJECT_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(PROJECT_ROOT / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    command.upgrade(cfg, "head")

    engine = create_engine(url, pool_pre_ping=True, future=True)
    yield engine
    engine.dispose()


@pytest.fixture()
def client(test_engine) -> Iterator[TestClient]:
    TestingSession = sessionmaker(
        bind=test_engine, autocommit=False, autoflush=False, future=True
    )

    def override_get_db() -> Iterator[Session]:
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        _sign_in_for_search(c)
        yield c
    app.dependency_overrides.clear()


# Search and listing pages need a signed-in visitor. Most tests are about what
# the search returns, not about signing in, so the client carries a token for
# those routes unless the request opts out with this header.
ANONYMOUS_HEADER = "X-Test-Anonymous"
_SIGNED_IN_ONLY = re.compile(
    r"^/api/v1/(businesses/search|search/(nearby|understand)"
    r"|businesses/by-slug/[^/]+|businesses/\d+/reviews(/summary)?)$"
)


def _sign_in_for_search(c: TestClient) -> None:
    email = f"searcher-{uuid.uuid4().hex[:10]}@example.ca"
    r = c.post(
        "/api/v1/signup",
        json={"name": "Test Searcher", "email": email, "password": "password123"},
    )
    token = r.json()["access_token"]

    def add_token(request) -> None:
        if request.headers.get(ANONYMOUS_HEADER):
            del request.headers[ANONYMOUS_HEADER]
            return
        if "authorization" not in request.headers and _SIGNED_IN_ONLY.match(request.url.path):
            request.headers["Authorization"] = f"Bearer {token}"

    c.event_hooks["request"].append(add_token)


@pytest.fixture(autouse=True)
def stub_pipeline(monkeypatch):
    """Stop uploads in tests from queueing real Celery work.

    The Celery worker builds its own session from Settings, so it talks to the
    development database - not the scratch test database these tests write to.
    A task queued here would look for a submission id that does not exist over
    there, fail, and retry three times. Tests assert the call was made instead;
    the chain itself is covered end to end against the real stack.
    """
    calls: list[int] = []
    monkeypatch.setattr(
        "app.api.v1.submissions.start_pipeline", lambda sid: calls.append(sid)
    )
    return calls


@pytest.fixture(autouse=True)
def clean_uploaded_objects():
    """Remove any objects tests pushed to storage, so the bucket stays tidy.

    Tests run against the real MinIO service; without this, every run would
    leave audio objects behind under audio/.
    """
    from app.services import storage

    def keys() -> set[str]:
        try:
            resp = storage.get_client().list_objects_v2(
                Bucket=storage.bucket_name(), Prefix="audio/"
            )
        except Exception:  # storage unavailable: nothing to clean
            return set()
        return {obj["Key"] for obj in resp.get("Contents", [])}

    before = keys()
    yield
    for key in keys() - before:
        storage.delete_video(key)


@pytest.fixture()
def unique_email() -> str:
    """A fresh email per test, so runs never collide on the unique index."""
    return f"test-{uuid.uuid4().hex[:12]}@example.ca"


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    """Counters are process-global; keep one test's requests from throttling the next."""
    from app.core import rate_limit

    rate_limit.reset()
    yield
    rate_limit.reset()
