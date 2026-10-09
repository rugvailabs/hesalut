# hesalut

*Search and get what you need.*

A local business directory for Metro Vancouver — search listings, read and leave
reviews, message a business, and manage your own listing — plus an older
voice-intake pipeline that shares the same backend.

> Development project. The seeded listings are invented: plausible Vancouver
> names, addresses and phone numbers attached to real neighbourhood centroids so
> that search, distance and rating filters have something to work on. None of
> them are real businesses.

## What's in here

One FastAPI backend serves **two products**:

**1. The directory** (the active work). Listings and a 12-category taxonomy,
full-text and location search, reviews with owner replies, enquiry leads, KYC
document verification, subscription plans, and an admin moderation console.

**2. A voice-intake pipeline** (the original build). Record or type a problem →
transcribe → extract structured fields → match a provider → human review. Lives
under the `submissions`, `consents` and `review` routes. The test suite covers
this half.

Buyer-to-business chat is **disabled**. The API still implements it — routes,
models, WebSocket handler and the `conversations` / `messages` tables are all
intact — but no client exposes it, so there is no way in from the web or mobile
app. Removing the UI is reverted by restoring the deleted files under
`web/app/chat/`; the helper functions they called are still in `web/lib/api.ts`.

### Clients

| Path | Stack | Port | Status |
| --- | --- | --- | --- |
| `web/` | Next.js 14 App Router, Tailwind v3 | **3001** | The directory app — current work |
| `mobile/` | Expo / React Native | — | Directory app for phones |
| `frontend/` | Next.js 16, React 19, Tailwind v4 | 3000 | The voice-intake UI — not actively developed |

The backend ships **no CORS middleware**, so browsers cannot call port 8000
directly. `web/` reaches it from Server Components and route handlers under
`web/app/api/*`, which also keeps the JWT in an httpOnly cookie that client-side
JavaScript never sees.

## Running it

Requires Docker and Node 18+.

### 1. Backend and infrastructure

```bash
cp .env.example .env        # then fill in SECRET_KEY and ANTHROPIC_API_KEY
docker compose up --build -d
```

That brings up eight containers: the API, a Celery worker and beat scheduler,
PostgreSQL, Redis, MinIO (object storage), ClamAV (upload scanning) and MailHog
(catches outbound mail).

Check it:

```bash
curl localhost:8000/health
curl localhost:8000/health/db
```

### 2. Database schema and seed data

Migrations do **not** run automatically at startup:

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend python -m scripts.seed
```

The seed is idempotent — safe to re-run. It creates 12 categories, 42 listings
across Metro Vancouver, reviews, enquiries, and a business-owner account whose
credentials it prints when it finishes (`owner@example.ca` / `ownerpass123`,
development only).

### 3. The web app

```bash
cd web
npm install
npm run dev            # http://localhost:3001
```

`web/.env.local` needs one variable, read server-side only:

```
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

### 4. The mobile app (optional)

```bash
cd mobile
npm install
npx expo start
```

## Ports

| Service | URL |
| --- | --- |
| Web app | http://localhost:3001 |
| API | http://localhost:8000/api/v1 |
| API docs | http://localhost:8000/docs |
| MailHog | http://localhost:8025 |
| MinIO console | http://localhost:9001 |
| PostgreSQL | `localhost:5432` |
| Redis | `localhost:6379` |

## Authentication

Email and password only, via `POST /signup`, `POST /login` and `GET /me`. The
token response is `{access_token, token_type}` — there is no refresh token, and
the JWT carries only `{sub, exp, iat}`. **Roles are not in the token**: the only
admin signal is `is_admin` on the `/me` response. Phone sign-in was removed; a
mobile number is now a contact detail, never a credential.

Both web clients run on localhost, and cookies ignore the port, so they use
different cookie names to avoid clobbering each other: `jd_access_token` for
`frontend/`, `jd_web_access_token` for `web/`.

## Layout

```
app/
  api/v1/       route handlers, one module per resource
  models/       SQLAlchemy models
  schemas/      Pydantic request and response models
  services/     storage, scanning, payments, transcription, extraction, matching
  core/         config, db session, security, deps, audit, uploads
  workers/      Celery app and tasks
alembic/        19 migrations
scripts/        seed data, evaluation harness, one-off utilities
tests/          pytest suite (voice-intake pipeline)
web/            Next.js directory app  (:3001)
mobile/         Expo directory app
frontend/       Next.js voice-intake app  (:3000)
```

## Tests

```bash
docker compose exec backend pytest
```

Ten test modules, all covering the voice-intake half: transcription, extraction,
the confidence gate, consent gating, upload validation and scanning, and the
review console. **The directory half has no automated tests yet.**

## Notes for contributors

A few constraints that are easy to get wrong:

- **No business photos table.** Listing cards use a category-tinted monogram, not
  a stock image.
- **No `is_featured` column.** The sponsored badge is styled but deliberately
  unused — don't build a promoted-listings rail on it.
- **The taxonomy is 12 flat categories**, no parents, no attribute fields.
- `opening_hours` exists on the business detail payload only, not on search
  results, so open/closed status appears on a profile and is absent from cards.
- **No SMS and no rate limiting** anywhere in `app/`.
- The `providers` table belongs to the voice-intake pipeline's matching logic,
  not to the directory. Pick a different name for any new concept.
- `app/services/payment_gateway.py` is a Stripe-shaped stub — subscription
  endpoints and rows are real, the money movement is not.

`web/` is mid-restyle onto a token-based design system in `web/components/ds/`.
Nothing downstream of `web/app/globals.css` should write a raw hex value.
`/design` renders the component gallery against live backend data and is how each
pass gets checked.

## Configuration

`.env` is git-ignored and Docker-ignored; copy `.env.example` and fill it in.
Keys worth knowing: `SECRET_KEY` (JWT signing), `ANTHROPIC_API_KEY` (extraction
and solving), the `MINIO_*` pair — note `MINIO_ENDPOINT` is the in-cluster
address while `MINIO_PUBLIC_ENDPOINT` is baked into presigned URLs and must be
reachable from the browser — and the `STRIPE_*` set used by the payments stub.
