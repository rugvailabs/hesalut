# Deploying a test site (free tiers)

A test deployment of the **directory** - search, business registration, plans,
placement, analytics - on free hosting. Not a production setup: there is no real
payment processor, the API sleeps when idle, and the seeded data is fictional.

```
browser ──► Vercel: web/ (Next.js)
                │  server-side requests only (the API has no CORS)
                ▼
            Render: API (FastAPI, Dockerfile.deploy)
                ├──► Neon: Postgres
                ├──► Cloudflare R2 or Backblaze B2: verification documents
                └──► Mailtrap sandbox: outgoing email (caught, never delivered)
```

**Not deployed:** the legacy voice-submission app (`VOICE_PIPELINE_ENABLED=false`).
It needs Whisper, ClamAV and Celery workers, none of which fit a free host, and the
directory does not use them. No Redis is needed without it. The `frontend/` and
`mobile/` apps are not part of this deployment either.

## 1. Accounts

Sign up for each (all free), signing in with GitHub where offered:

| Service | Used for | Notes |
|---|---|---|
| [Render](https://render.com) | API | Grant access to `rugvailabs/justforyou` |
| [Vercel](https://vercel.com) | Web app | Grant access to `rugvailabs/justforyou` |
| [Neon](https://neon.tech) | Postgres | No card needed |
| [Cloudflare R2](https://developers.cloudflare.com/r2/) or [Backblaze B2](https://www.backblaze.com/cloud-storage) | Documents | R2 may ask for a payment method to enable the free tier |
| [Mailtrap](https://mailtrap.io) | Email | Use **Email Testing** (sandbox), not Email Sending |

Free-tier terms change; check each provider's current limits.

## 2. Database - Neon

1. Create a project in **AWS us-west-2 (Oregon)** - the same region as the API.
2. Copy the connection string. It looks like
   `postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require`. Keep `sslmode=require`.

Tables are created automatically when the API starts (`scripts/start-api.sh` runs
`alembic upgrade head`), including the three plans.

## 3. Documents - object storage

**Cloudflare R2**
1. Create a bucket named `kyc-documents`.
2. Create an R2 API token with *Object Read & Write* on that bucket. Note the
   access key ID and secret.
3. The endpoint is `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`. Region: `auto`.

**Backblaze B2** (alternative)
1. Create a *private* bucket. B2 bucket names are global, so it may need a
   different name - use it for `MINIO_BUCKET_DOCUMENTS`.
2. Create an application key for that bucket.
3. The endpoint is shown on the bucket, e.g. `https://s3.us-west-004.backblazeb2.com`;
   the region is the middle part, e.g. `us-west-004`.

Create the bucket yourself: the API tries to create a missing bucket, but a key
scoped to one bucket is not allowed to. No bucket CORS rule is needed - uploads go
through the web app's server, never straight from the browser.

## 4. Email - Mailtrap sandbox

Email Testing → your inbox → SMTP settings. Note host (`sandbox.smtp.mailtrap.io`),
port `2525`, username and password. Every email the site sends lands in that inbox.

## 5. API - Render

1. **New → Blueprint**, pick `rugvailabs/justforyou`. Render reads `render.yaml`.
2. Fill in the values it asks for:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon connection string |
| `MINIO_ENDPOINT` | Storage endpoint (step 3) |
| `MINIO_PUBLIC_ENDPOINT` | Same as `MINIO_ENDPOINT` |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | Storage key (step 3) |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASSWORD` | Mailtrap (step 4) |
| `WEB_BASE_URL` | The Vercel URL - use a placeholder for now, fix in step 7 |
| `STRIPE_SUCCESS_URL` | `<WEB_BASE_URL>/register?step=4` |
| `STRIPE_CANCEL_URL` | `<WEB_BASE_URL>/register?step=3` |

Set by the Blueprint, change only if needed: `ENVIRONMENT=staging`,
`VOICE_PIPELINE_ENABLED=false`, `SECRET_KEY` (generated), `SMTP_PORT=2525`,
`SMTP_USE_TLS=true`, `STORAGE_REGION=auto` (**set the B2 region instead if using
B2**), `MINIO_BUCKET_DOCUMENTS=kyc-documents`.

3. Deploy. When it is live, `https://<service>.onrender.com/health` returns
   `{"status":"ok"}` and `/health/db` returns `"db":"connected"`.

Keep `ENVIRONMENT` as `staging`: the test checkout (fake cards) refuses to run in
`production`. Outside `development` the API also refuses to start with the example
`SECRET_KEY`.

## 6. Web app - Vercel

1. **Add New → Project**, import `rugvailabs/justforyou`.
2. **Root Directory: `web`**. Framework is detected as Next.js; leave build settings.
3. Environment variables - **set them before the first deploy**. `NEXT_PUBLIC_*`
   values are built into the app, so changing one later needs a redeploy:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://<service>.onrender.com/api/v1` |
| `NEXT_PUBLIC_MAX_DOCUMENT_MB` | `4` - Vercel rejects request bodies over ~4.5 MB |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Optional. Blank uses OpenStreetMap |
| `NEXT_PUBLIC_GOOGLE_MAP_ID` | Optional |
| `ALLOW_INDEXING` | **Leave unset.** The site stays out of search engines |
| `INTERNAL_PROXY_SECRET` | A long random string, the same value as `TRUSTED_PROXY_SECRET` on the API. Without it every visitor shares Vercel's address and the API's per-IP rate limits (login, signup, enquiries) throttle everyone together |

4. Deploy.

## 7. Connect them

1. On Render, set `WEB_BASE_URL` to the Vercel URL (e.g. `https://justforyou.vercel.app`)
   and update `STRIPE_SUCCESS_URL` / `STRIPE_CANCEL_URL` to match. Render redeploys.
2. If a Google Maps key is used, add the Vercel URL to the key's allowed referrers.

## 8. Demo data (optional)

The database starts with plans and nothing else. To load the fictional Metro
Vancouver listings, reviews and owner, run the seed against Neon from this machine:

```sh
docker build -f Dockerfile.deploy -t justforyou-api:deploy .
docker run --rm \
  -e DATABASE_URL="<Neon connection string>" \
  -e SECRET_KEY=seed-only \
  -e SMTP_HOST=unused -e SMTP_PORT=25 \
  -e MINIO_ENDPOINT=http://unused -e MINIO_ACCESS_KEY=unused -e MINIO_SECRET_KEY=unused \
  justforyou-api:deploy sh -c "alembic upgrade head && python -m scripts.seed"
```

It warns `could not seed the video object` - that sample belongs to the voice app,
which is off, and nothing else is affected.

Add `&& python -m scripts.demo_placement` to put a few listings on paid plans so
Featured and Promoted results show; `python -m scripts.demo_placement --undo`
removes them.

**The seed creates accounts with passwords printed in its output** (e.g.
`owner@example.ca`). Anyone who knows them can sign in to the test site. Delete them
or change their passwords if the link is shared.

To make an account an admin, run in Neon's SQL editor:

```sql
UPDATE users SET is_admin = true, role = 'admin' WHERE email = 'you@example.com';
```

## 9. Check it works

- [ ] Home page loads (first request after idle wakes the API: 30-60 s)
- [ ] Search and "near me" return results (with demo data; its listings are in Vancouver)
- [ ] Register a business: test card `4242 4242 4242 4242`, any future expiry, any CVC
- [ ] Welcome and receipt emails arrive in the Mailtrap inbox
- [ ] Upload a verification document under 4 MB from the owner dashboard
- [ ] `/robots.txt` says `Disallow: /`

## Releasing a change that adds a table or column

**Order matters: database, then API, then web.** The web pages call API routes that
read the new tables; if they go live first, every call to them fails. That is how the
Favorites button broke once - the pages shipped before the `favorites` table existed.

1. **Migrate the live database first**, from the project root against the live
   `DATABASE_URL`: `alembic upgrade head`. Do not assume the deploy does it: only
   `Dockerfile.deploy` (via `scripts/start-api.sh`) runs migrations on start, and a
   Render service still built from `./Dockerfile` does not. Check with
   `alembic current` that it reports the new head.
2. **Deploy the API** (Render), and check `/health`.
3. **Deploy the web app** (`vercel deploy --prod --yes` from `web/`).

Each migration is additive, so the API that is still running keeps working between
steps 1 and 2. Booking adds three things to know about:

- `CREATE EXTENSION btree_gist` is part of the booking migration. Neon and Render
  Postgres allow it; if yours does not, the migration stops with a clear error and
  nothing is half-applied.
- The meaning-based search migration skips itself when `pgvector` is missing, and
  search stays on keywords.
- Set `TRUSTED_PROXY_SECRET` on the API and the same value as `INTERNAL_PROXY_SECRET`
  on Vercel, or every visitor shares one rate-limit bucket.

## Known limits of this setup

- **The API sleeps** after 15 minutes idle on Render's free tier; the next visitor
  waits for it to start.
- **No real payments.** The test checkout accepts only published test cards.
- **Provincial sales tax** (PST/QST) is not collected - see `app/services/sales_tax.py`.
- **Search impressions** are kept indefinitely; set a retention period before launch.
- **One API instance.** Migrations run on start, which is safe for one instance, not
  for several starting at once.
- The legacy voice routes (`/submissions`, `/consents`, `/review`) return 404.
