from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, loaded from environment variables (or a .env file)."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    database_url: str
    #: Celery's broker. Only the voice pipeline uses it, so a directory-only
    #: deployment (VOICE_PIPELINE_ENABLED=false) needs no Redis at all.
    redis_url: str = "redis://redis:6379/0"
    secret_key: str
    #: Voice pipeline only. Blank falls back to the keyword classifier.
    anthropic_api_key: str = ""
    smtp_host: str
    smtp_port: int
    #: Blank for an SMTP server that takes no login (MailHog locally).
    smtp_user: str = ""
    smtp_password: str = ""
    #: Envelope sender for outbound mail.
    mail_from: str = "justforyou <no-reply@justforyou.ca>"
    #: Where /support messages land. Reply-To is set to the sender, so a
    #: reply from this inbox reaches the person who wrote in.
    support_email: str = "support@justforyou.ca"
    #: Dev SMTP sinks (Mailhog) accept plaintext on a non-standard port and
    #: have no credentials; production SMTP will need both flipped on.
    smtp_use_tls: bool = False

    #: Public address of the web app, for links in emails.
    web_base_url: str = "http://localhost:3001"
    #: GST/HST registration number, printed on receipts. A business charging
    #: GST/HST must show it on invoices over $30 - set it before taking real
    #: payments.
    gst_hst_registration_number: str = ""

    # Object storage (MinIO locally; S3 / Canadian-region cloud storage later).
    # `minio_endpoint` is what the SDK talks to. `minio_public_endpoint` is what
    # gets baked into presigned URLs - it must be reachable from the browser,
    # which cannot resolve an in-cluster service name like "minio". Defaults to
    # minio_endpoint when the two are the same host.
    minio_endpoint: str
    minio_public_endpoint: str | None = None
    minio_access_key: str
    minio_secret_key: str
    minio_bucket_videos: str = "justdial-videos"
    #: KYC licence and GST documents. Separate from the video bucket so a
    #: retention rule on one cannot sweep the other, and so the two can end up
    #: in different regions or lifecycle policies later.
    minio_bucket_documents: str = "kyc-documents"
    #: The region requests are signed for. MinIO and Cloudflare R2 accept
    #: us-east-1 ("auto" also works on R2); Backblaze B2 needs the region in
    #: its endpoint, e.g. us-west-004.
    storage_region: str = "us-east-1"

    #: The legacy voice-submission app: recorded problems transcribed by
    #: Whisper, virus-scanned by ClamAV and processed by Celery workers. The
    #: directory does not use any of it. False leaves its routes unmounted and
    #: skips its startup work, which is what lets the API run on a small host
    #: with no ClamAV, no workers, no Redis and no Whisper model.
    voice_pipeline_enabled: bool = True

    # Malware scanning (ClamAV daemon).
    clamav_host: str = "clamav"
    clamav_port: int = 3310

    # Speech-to-text (faster-whisper / CTranslate2).
    #
    # Model size is the accuracy/speed/RAM trade-off:
    #   tiny   ~75 MB   fastest, noticeably worse on accents and noise
    #   base   ~145 MB  the local-dev default: usable English, weak French
    #   small  ~480 MB  markedly better bilingual accuracy, ~2-3x slower
    #   medium ~1.5 GB  better again, too heavy for a laptop without a GPU
    # Canada is an en/fr market, so production will likely want `small` or
    # larger; `base` is chosen here to keep the dev stack inside its memory
    # budget alongside ClamAV.
    whisper_model_size: str = "base"

    # CPU inference through CTranslate2 with int8 quantisation is the portable
    # default. On a GPU box set whisper_device="cuda" and
    # whisper_compute_type="float16" - no other code changes are needed.
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"

    # Number of CPU threads CTranslate2 may use. 0 lets it decide.
    whisper_cpu_threads: int = 0

    whisper_beam_size: int = 5

    # Wall-clock ceiling on decoding one submission. Segments stop being
    # consumed past this point and the partial transcript is flagged for
    # review, so a pathological file cannot occupy a worker indefinitely.
    whisper_timeout_seconds: int = 300

    # Below this language-detection probability the result is not trusted
    # enough to act on unreviewed. Whisper is confidently wrong on very short
    # or noisy audio.
    whisper_min_language_confidence: float = 0.5

    # A transcript shorter than this almost always means the audio was silent,
    # inaudible, or mostly music - not that the caller was brief.
    whisper_min_transcript_chars: int = 20

    # --- Anthropic / LLM -------------------------------------------------
    llm_model: str = "claude-opus-5"
    #: low | medium | high | xhigh | max. Extraction is not hard reasoning;
    #: solution generation in a later phase will want more.
    llm_effort: str = "medium"
    llm_max_tokens: int = 4096
    llm_timeout_seconds: float = 60.0
    #: The SDK retries 429/5xx/connection errors itself before raising.
    llm_max_retries: int = 2
    #: Development escape hatch. With no API key configured, fall back to the
    #: keyword classifier instead of routing every submission to review, so a
    #: local stack stays usable. Every fallback is logged and recorded in
    #: raw_json, and Phase 7's confidence gate must treat it as low trust.
    #: Set false in any deployment that faces real customers.
    llm_fallback_to_keywords: bool = True

    # --- smart search: plain-language queries (app/services/query_understanding.py)
    #: Off switch. With no Anthropic key configured it is effectively off anyway:
    #: every query falls back to plain keyword search.
    smart_search_enabled: bool = True
    search_llm_model: str = "claude-opus-5-5"
    #: Mapping a query onto a fixed list of filters is classification, not deep
    #: reasoning - low effort keeps each search fast and cheap.
    search_llm_effort: str = "low"
    search_llm_max_tokens: int = 4096
    #: A search that waits longer than this falls back to keywords instead.
    search_llm_timeout_seconds: float = 12.0
    smart_search_cache_ttl_seconds: int = 24 * 3600
    #: Hard ceiling on AI calls across the whole service, per minute. The
    #: endpoint is public, so this bounds what a flood of unique queries can
    #: cost; past it, queries fall back to keywords until the minute rolls over.
    smart_search_max_ai_calls_per_minute: int = 60

    # --- semantic search: meaning-based matching (app/services/embeddings.py)
    #: Voyage AI embeddings. Empty key = semantic matching off; search is then
    #: exactly the keyword search it was before.
    voyage_api_key: str = ""
    embedding_model: str = "voyage-3.5"
    #: Must match the vector(...) width in migration b3d8f2a6c9e1.
    embedding_dimensions: int = 1024
    #: Cosine similarity a listing needs to count as a meaning match.
    semantic_min_similarity: float = 0.45
    semantic_max_matches: int = 30

    # --- confidence gate --------------------------------------------------
    #: Below this, an answer is held for human review. Start high and lower it
    #: only on evidence that held tickets were being approved unchanged.
    gate_confidence_threshold: float = 0.85
    #: There is deliberately no "skip the gate" switch. If you need one for a
    #: load test, raise the threshold to 1.1 so nothing can pass, never the
    #: reverse.

    # --- payments (Stripe) ------------------------------------------------
    #: Blank means stub mode: /plans, /subscriptions/checkout and the webhook
    #: all work, subscription rows are created and moved through their states,
    #: but no money is involved. Fill these in to switch to the real gateway;
    #: nothing else changes. See app/services/payment_gateway.py.
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    #: Handed to the client so it can mount Stripe.js. Publishable by design.
    stripe_publishable_key: str = ""
    #: Where the gateway returns the customer when the API caller does not say.
    stripe_success_url: str = "http://localhost:3001/dashboard?checkout=success"
    stripe_cancel_url: str = "http://localhost:3001/dashboard?checkout=cancelled"

    environment: str = "development"

    @property
    def presign_endpoint(self) -> str:
        """Endpoint used when signing URLs handed to a browser."""
        return self.minio_public_endpoint or self.minio_endpoint


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance so env parsing happens once per process."""
    return Settings()
