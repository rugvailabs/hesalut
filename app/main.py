import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.v1 import api_router
from app.api.v1 import chat_ws
from app.core.config import get_settings
from app.core.db import get_db
from app.core.uploads import MAX_UPLOAD_BYTES, human_size
from app.services import storage

settings = get_settings()

# uvicorn configures only its own loggers, so without this the application's
# own log records - including storage failures on startup - are discarded.
logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s:     %(name)s - %(message)s",
)

logger = logging.getLogger(__name__)


PLACEHOLDER_SECRET_KEY = "change-me-to-a-long-random-string"


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Refuse an unsafe secret outside development; prepare the videos bucket."""
    if settings.environment != "development" and settings.secret_key in {
        "",
        PLACEHOLDER_SECRET_KEY,
    }:
        # Every login token is signed with this. A deployment reachable from
        # the internet with the example value would let anyone mint tokens.
        raise RuntimeError(
            "SECRET_KEY is unset or still the example value. Set a long random "
            "value before running outside development."
        )
    if not settings.voice_pipeline_enabled:
        # The videos bucket belongs to the voice pipeline; nothing else needs it.
        yield
        return
    if not storage.ensure_bucket():
        # Deliberately not fatal: the API should still start so /health works
        # and the operator can see what is wrong. Uploads will fail loudly.
        logger.error(
            "storage: bucket %r is not available - video uploads will fail",
            storage.bucket_name(),
        )
    yield


app = FastAPI(title="hesalut", version="0.1.0", lifespan=lifespan)

@app.middleware("http")
async def reject_oversized_uploads(request: Request, call_next):
    """Reject an over-limit upload from its Content-Length, before the body.

    FastAPI parses a multipart body *before* it resolves route dependencies, so
    a check inside the handler only runs once the whole file has already been
    received. This middleware sees the headers first, so an honest client is
    turned away without transferring 100 MB. The handler still counts bytes as
    it streams, for clients that lie about or omit the header.
    """
    if request.method == "POST" and request.url.path.endswith("/submissions/upload"):
        declared = request.headers.get("content-length")
        if declared and declared.isdigit() and int(declared) > MAX_UPLOAD_BYTES:
            return JSONResponse(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                content={
                    "detail": (
                        f"File is too large. The limit is "
                        f"{human_size(MAX_UPLOAD_BYTES)}, but this request declared "
                        f"{human_size(int(declared))}."
                    )
                },
            )
    return await call_next(request)


app.include_router(api_router)
# Absolute paths (/ws/..., and the ticket endpoint), so not under api_router.
app.include_router(chat_ws.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/health/db")
def health_db(db: Session = Depends(get_db)) -> dict:
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001 - surfaced verbatim to the caller
        raise HTTPException(
            status_code=503,
            detail=f"database unavailable: {exc}",
        ) from exc
    return {"status": "ok", "db": "connected"}
