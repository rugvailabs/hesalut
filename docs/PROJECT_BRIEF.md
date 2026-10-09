# hesalut — project brief for feature suggestions

*Written 2026-09-29 against commit `3d97bdb`. If you are an AI agent or a new
developer asked to suggest features, read this first, then check the code — the
code wins wherever the two disagree.*

## What it is

**hesalut** is a local business directory in the style of JustDial, built for
**Canada** and currently seeded for **Metro Vancouver**. People search for a
business (a plumber, a dentist, a hotel), compare listings, read reviews and send
an enquiry. Business owners register, pick a plan, verify their identity and
manage their listing. An admin moderates everything.

It is a **development project**. Every seeded listing is invented — plausible
names and addresses, `555` phone numbers, `example.com` websites. None of them are
real businesses.

The same repo also holds an **older, unrelated product** (a voice-intake
pipeline: record a problem → transcribe → extract → match a provider → human
review). It is not being developed. **Suggest features for the directory, not for
this.**

## Who uses it

| Role | What they can do today |
|---|---|
| **Visitor / customer** | Search, filter, view a business, read reviews, leave a review, send an enquiry, save favorites (signed in), switch EN/FR on Explore |
| **Business owner** | 4-step registration with a plan and payment, create/edit a listing, upload KYC documents, read and reply to reviews, read their leads, see how their listing performs in search |
| **Admin** | Approve listings, review KYC verifications, moderate reviews, read every lead (with CSV export), see search analytics |

Sign-in is **email + password only**. There is no social login and no phone
one-time-code login (it existed briefly and was removed on purpose).

## Tech stack

| Part | Stack | Where |
|---|---|---|
| Backend API | FastAPI, SQLAlchemy, Alembic, PostgreSQL | `app/`, `alembic/` |
| Web app (the directory) | Next.js 14 App Router, Tailwind v3, TypeScript | `web/` |
| Mobile app | Expo / React Native | `mobile/` |
| Legacy voice UI | Next.js 16 — **ignore** | `frontend/` |

The browser never calls the API directly (there is no CORS). Web pages call it
server-side, and `web/app/api/*` route handlers proxy the rest. The login token
lives in an httpOnly cookie.

## What is built and works

**Search and discovery**
- Search by keyword and location, with "near me" (browser location, widens to
  nearest-at-any-distance if nothing is within 25 km).
- Filters, several values at once: categories, cities, rating bands (5 / 4.5+ /
  4+ / 3+), opening hours (open now / weekends / evenings), postal code, price
  level. Sorts: relevance, rating, review count, distance, name, newest, price.
- **Paid placement.** Businesses on the Annual plan appear first ("Featured"),
  then Monthly ("Promoted", the top 3 rotate every 30 minutes), then Basic, then
  no plan. Paid results carry a visible badge and a disclosure note. Placement
  only changes the **order** — nothing is ever hidden.
- Search impressions and clicks are logged; owners see their own numbers, the
  admin sees totals.
- **Explore** (`/explore`, `/explore/results`) — the newer search experience: a
  single search bar with suggestions, then results with a filter rail, card/list
  and map views, infinite scroll, a preview modal, favorites, recent and saved
  searches, dark mode and an EN/FR switch.
- City/category landing pages (`/[province]/[city]/[category]`) and an
  All Categories page.
- Maps: Google Maps when a key is configured, OpenStreetMap otherwise.

**Businesses and owners**
- Business profile page with details, opening hours, map, reviews and an
  enquiry form.
- 4-step owner registration: account → business details → plan → payment.
  A signed-in customer can convert their account to an owner account.
- Plans: **Annual, Monthly, Basic**, priced in CAD, with GST/HST calculated from
  the business's province and an auto-renewal consent checkbox.
- KYC document upload and admin verification; verified businesses get a badge.
- Owner dashboard: edit listing, leads inbox, reviews with owner replies,
  verification status, search performance.

**Other**
- Reviews with owner replies and admin moderation.
- Enquiries (leads) to a business; admin-wide lead inbox with CSV export.
- Favorites (signed-in users).
- Support/contact inbox, About, Privacy and Terms pages.
- Transactional email (sent through a local test mail server in development).

## What is missing, fake or limited — read before suggesting

These are the gaps that past planning documents repeatedly got wrong. Treat them
as **facts**, not as things to assume exist.

- **Payments are simulated.** Checkout is a test stub shaped like Stripe; no money
  moves. Only subscriptions exist — no one-time payments, no refunds, no invoices
  beyond a receipt email. PST/QST are listed but not collected.
- **The taxonomy is 12 flat categories**: Plumbers, Electricians, Restaurants,
  Dentists, Auto Repair, Gyms & Fitness, Salons & Spas, Movers & Storage,
  IT Support, Legal Services, Hotels & Stays, Car Rentals. No subcategories, no
  category-specific attributes. (Docs have claimed "1,575 categories" — false.)
- **No photos.** There is no business-photos table; cards show a coloured
  monogram.
- **No prices on listings yet.** The price filter works but no public listing has
  a price set, so it returns nothing.
- **Ratings are mostly seed data.** Most listings show a rating and review count
  that are not backed by actual review rows.
- **No SMS, no WhatsApp, no push notifications, no rate limiting.**
- **Chat is disabled.** Buyer-to-business chat is fully built in the API
  (including WebSocket), but the UI was removed on purpose.
- **Only English/French on Explore.** The rest of the site is English only; dark
  mode also applies to Explore only.
- **No booking, appointments, quotes, deals/coupons, or loyalty.**
- **One region.** All listings are in Metro Vancouver.

## Decisions already made — don't propose reversing these without a reason

- Paid plans **do** rank higher in search, but nothing is ever hidden, and paid
  results are always labelled.
- Login is email + password; a phone number is a contact detail, never a login.
- Owners register through the 4-step flow, and a listing is only created when
  registration completes.
- Canadian rules come first: CAD, GST/HST by province, auto-renewal consent,
  honest plan copy (paid perks that don't exist yet are marked "coming soon").
- The Explore dashboard is **only a search bar** — no extra widgets on it.

## Current deployment (test only)

- Web: https://justforyou-web-mohan-f6d6.vercel.app
- API: Render free tier (sleeps after 15 minutes idle; first request takes about
  a minute).
- Not deployed yet: file storage (KYC document links are dead), real email.
- The live API may lag behind `main` — check it before assuming a feature is live.

## Where to look in the code

| Topic | Files |
|---|---|
| API routes | `app/api/v1/*.py` (search: `businesses.py`, `search.py`) |
| Search ranking | `app/services/priority_search.py`, `app/services/placement.py` |
| Registration, plans, tax | `app/api/v1/registration.py`, `app/services/sales_tax.py`, `app/services/payment_gateway.py` |
| Database tables | `app/models/*.py`, migrations in `alembic/versions/` |
| Web pages | `web/app/**/page.tsx` |
| Explore | `web/app/explore/`, `web/components/explore/`, `web/lib/explore.ts` |
| Seed data | `scripts/seed_directory.py` |

## What we want from you

Suggest **new features or improvements for the directory**. For each suggestion
give:

1. **The feature**, in one or two sentences.
2. **Who it is for** — customer, business owner, or admin.
3. **The problem it solves**, and why it matters for a Canadian local directory.
4. **What it builds on** in the existing code (name the files or tables), or what
   new pieces it needs.
5. **Rough size** — small (a day or two), medium (about a week), large (more).
6. **Risks or dependencies** — e.g. needs real payments, needs a paid API,
   privacy or legal concerns in Canada (PIPEDA, CASL for email/SMS, Quebec
   language rules).

Order them from most to least valuable. Say plainly if a suggestion depends on
something from the "missing" list above being built first.
