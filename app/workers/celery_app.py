"""Celery application: broker, result backend and task discovery."""

from __future__ import annotations

from celery import Celery
from celery.signals import worker_process_init

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "hesalut",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
)

# Picks up app/workers/tasks.py
celery_app.autodiscover_tasks(["app.workers"])


@worker_process_init.connect
def _load_whisper_model(**_kwargs) -> None:
    """Load the Whisper model once per worker child, at start-up.

    Under the prefork pool each child runs tasks in its own process, so the
    model has to exist in the child - loading it in the parent before the fork
    is not reliably inherited by CTranslate2. Doing it here means the first
    real submission does not pay the several-second load, and the model is
    never reloaded per task.

    Worker concurrency is capped in docker-compose for exactly this reason:
    every child holds its own copy of the weights.
    """
    from app.services import transcription

    transcription.warm_up()

__all__ = ["celery_app"]
