"""The database URL names its driver, so a host's bare URL works whatever SQLAlchemy defaults to."""

from __future__ import annotations

import pytest
from sqlalchemy.engine import make_url

from app.core.config import Settings, normalize_database_url

HOST = "user:pass@dpg-abc.oregon-postgres.render.com/db"


@pytest.mark.parametrize(
    ("given", "expected"),
    [
        (f"postgresql://{HOST}", f"postgresql+psycopg2://{HOST}"),
        (f"postgres://{HOST}", f"postgresql+psycopg2://{HOST}"),
        (f"postgresql://{HOST}?sslmode=require", f"postgresql+psycopg2://{HOST}?sslmode=require"),
        (f"  postgresql://{HOST}\n", f"postgresql+psycopg2://{HOST}"),
        # A driver named on purpose is left alone.
        (f"postgresql+psycopg2://{HOST}", f"postgresql+psycopg2://{HOST}"),
        (f"postgresql+psycopg://{HOST}", f"postgresql+psycopg://{HOST}"),
    ],
)
def test_bare_postgres_urls_get_the_installed_driver(given, expected):
    assert normalize_database_url(given) == expected


def test_a_bare_url_resolves_to_psycopg2_not_whatever_sqlalchemy_defaults_to():
    url = normalize_database_url(f"postgresql://{HOST}")

    assert make_url(url).get_dialect().driver == "psycopg2"


def test_settings_apply_it_to_the_environment_value(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"postgresql://{HOST}?sslmode=require")

    assert Settings().database_url == f"postgresql+psycopg2://{HOST}?sslmode=require"
