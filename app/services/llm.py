"""Anthropic client wrapper.

The only module in the project that talks to the Anthropic SDK. Everything else
calls through here, so timeouts, retries, model choice, cost accounting and the
"is a key even configured" question all have exactly one answer.

Error contract, mirroring the one transcription already uses:

    LLMUnavailable   no usable credentials, or the request was rejected in a
                     way that retrying cannot fix. Permanent - route to review.
    LLMTransient     rate limited, server error, connection dropped. Retryable.
"""

from __future__ import annotations

import logging
import time
from functools import lru_cache
from typing import TYPE_CHECKING, Any, TypeVar

from pydantic import BaseModel

from app.core.config import get_settings

if TYPE_CHECKING:  # pragma: no cover - typing only
    import anthropic

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

#: Per-million-token prices for the configured model, used for cost logging.
#: Update alongside settings.llm_model.
_PRICING: dict[str, tuple[float, float]] = {
    "claude-opus-5-5": (4.00, 20.00),
    "claude-opus-5": (5.00, 25.00),
    "claude-sonnet-5": (2.00, 10.00),
    "claude-haiku-4-5": (1.00, 5.00),
}


class LLMUnavailable(RuntimeError):
    """No usable credentials, or a request the model will never accept.

    Permanent for this deployment: retrying the same call changes nothing, so
    the caller routes the submission to human review.
    """


class LLMTransient(RuntimeError):
    """Rate limit, server error or connection failure. Worth retrying."""


def is_configured() -> bool:
    """True when a key that could plausibly work is present.

    The repo ships a placeholder in .env.example, and a placeholder produces a
    401 on every call - catching that here turns a confusing auth error into a
    clear configuration message.
    """
    key = (get_settings().anthropic_api_key or "").strip()
    if not key.startswith("sk-ant-"):
        return False
    # The shipped placeholder is a run of x's.
    return "xxxxxxxx" not in key and len(key) > 40


@lru_cache(maxsize=1)
def get_client() -> "anthropic.Anthropic":
    """One client per process. Raises LLMUnavailable if nothing is configured."""
    import anthropic

    if not is_configured():
        raise LLMUnavailable(
            "No Anthropic API key configured. Set ANTHROPIC_API_KEY in .env "
            "(the shipped value is a placeholder)."
        )

    settings = get_settings()
    return anthropic.Anthropic(
        api_key=settings.anthropic_api_key,
        timeout=settings.llm_timeout_seconds,
        max_retries=settings.llm_max_retries,
    )


def _log_usage(label: str, response: Any, elapsed: float, model: str) -> None:
    """Record tokens and estimated cost for every call."""
    usage = getattr(response, "usage", None)
    if usage is None:
        return

    in_tok = getattr(usage, "input_tokens", 0) or 0
    out_tok = getattr(usage, "output_tokens", 0) or 0
    cached = getattr(usage, "cache_read_input_tokens", 0) or 0

    in_price, out_price = _PRICING.get(model, (0.0, 0.0))
    cost = (in_tok / 1_000_000 * in_price) + (out_tok / 1_000_000 * out_price)

    logger.info(
        "llm: %s model=%s in=%d out=%d cached=%d cost=$%.5f elapsed=%.2fs",
        label,
        model,
        in_tok,
        out_tok,
        cached,
        cost,
        elapsed,
    )


def parse(
    *,
    label: str,
    system: str,
    user: str,
    output_format: type[T],
    max_tokens: int | None = None,
    effort: str | None = None,
    model: str | None = None,
    timeout: float | None = None,
    max_retries: int | None = None,
) -> T:
    """Run one structured-output call and return the validated model.

    Uses the SDK's `messages.parse`, so the response is schema-checked before
    it reaches the caller - there is no hand-rolled JSON parsing anywhere in
    this project.

    Args:
        label: Short name for logs and cost accounting, e.g. "extraction".
        system: System prompt. Kept stable across calls so it can be cached.
        user: The request-specific content.
        output_format: Pydantic model the response must conform to.
        max_tokens: Override the configured default.
        effort: Override the configured reasoning effort.
        model: Override the configured model (smart search runs its own).
        timeout: Override the client timeout, in seconds - for callers a
            person is waiting on.
        max_retries: Override the client's retry count.

    Raises:
        LLMUnavailable: no credentials, or a request the model rejects outright.
        LLMTransient: rate limit, server error, or connection failure.
    """
    import anthropic

    settings = get_settings()
    model = model or settings.llm_model
    client = get_client()
    overrides: dict[str, Any] = {}
    if timeout is not None:
        overrides["timeout"] = timeout
    if max_retries is not None:
        overrides["max_retries"] = max_retries
    if overrides:
        client = client.with_options(**overrides)

    started = time.perf_counter()
    try:
        response = client.messages.parse(
            model=model,
            max_tokens=max_tokens or settings.llm_max_tokens,
            thinking={"type": "adaptive"},
            output_config={"effort": effort or settings.llm_effort},
            system=[
                {
                    "type": "text",
                    "text": system,
                    # The system prompt is identical on every call of a given
                    # kind, so caching it is close to free money.
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[{"role": "user", "content": user}],
            output_format=output_format,
        )
    except (anthropic.AuthenticationError, anthropic.PermissionDeniedError) as exc:
        raise LLMUnavailable(f"Anthropic rejected our credentials: {exc}") from exc
    except anthropic.NotFoundError as exc:
        raise LLMUnavailable(f"Model {model!r} is not available: {exc}") from exc
    except anthropic.BadRequestError as exc:
        # A malformed request will be malformed again on retry.
        raise LLMUnavailable(f"Anthropic rejected the request: {exc}") from exc
    except anthropic.RateLimitError as exc:
        raise LLMTransient(f"Rate limited: {exc}") from exc
    except anthropic.APIConnectionError as exc:
        raise LLMTransient(f"Could not reach Anthropic: {exc}") from exc
    except anthropic.APIStatusError as exc:
        if exc.status_code >= 500:
            raise LLMTransient(f"Anthropic server error {exc.status_code}: {exc}") from exc
        raise LLMUnavailable(f"Anthropic error {exc.status_code}: {exc}") from exc

    elapsed = time.perf_counter() - started
    _log_usage(label, response, elapsed, model)

    if response.stop_reason == "refusal":
        detail = getattr(response, "stop_details", None)
        raise LLMUnavailable(
            f"Model declined the request"
            f"{f' ({detail.category})' if detail else ''}"
        )

    parsed = response.parsed_output
    if parsed is None:
        raise LLMTransient("Model returned no parseable output")
    return parsed


__all__ = ["LLMUnavailable", "LLMTransient", "is_configured", "get_client", "parse"]
