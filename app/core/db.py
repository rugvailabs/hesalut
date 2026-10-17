
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.models.base import Base

settings = get_settings()
url = str(settings.database_url)

print("DB URL type:", type(url).__name__)
print("DB URL length:", len(url))
print(
    "DB URL scheme:",
    url.split("://", 1)[0] if "://" in url else "MISSING",
)
print("DB URL has placeholder:", "${{" in url or "}}" in url)
print("DB URL has whitespace:", any(c.isspace() for c in url))
print(
    "DB URL starts/ends with quote:",
    url.startswith(("'", '"')) or url.endswith(("'", '"')),
)

try:
    parsed_url = make_url(url)
    print("DB URL parsed successfully")
    print("DB driver:", parsed_url.drivername)
    print("DB hostname present:", bool(parsed_url.host))
    print("DB database present:", bool(parsed_url.database))
except Exception as exc:
    print("DB URL parsing failed:", type(exc).__name__)
    raise

engine = create_engine(url, pool_pre_ping=True, future=True)

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    future=True,
)

__all__ = ["Base", "engine", "SessionLocal", "get_db"]


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
