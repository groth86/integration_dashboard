# Integration Dashboard

A retro CRT terminal-themed dashboard for monitoring integration status across
customers and systems, with user management and per-account access control.

Built with **Next.js (App Router)**, **Drizzle ORM**, and **PostgreSQL**.

---

## Features

- **Authentication** — username/password login with bcrypt-hashed passwords and
  signed httpOnly session cookies. Routes are protected by middleware.
- **User management** (admin only) — create users, set passwords, assign roles,
  and grant access to specific customer accounts.
- **Account Overview** — per-day integration status grid, scoped to the accounts
  each user is allowed to see. Click any cell to drill into the Integration Log
  with filters pre-applied.
- **Integration Log** — detailed record log with filters, per-column search,
  export controls, and pagination.
- **Themes** — Retro (active). Modern is a placeholder.

---

## Architecture

| Layer            | Choice                                                     |
|------------------|------------------------------------------------------------|
| Framework        | Next.js 15 (App Router)                                    |
| Database         | PostgreSQL (hosted on Railway)                             |
| ORM / migrations | Drizzle ORM + drizzle-kit                                  |
| Auth             | bcryptjs + jose (JWT in httpOnly cookie), route middleware |

The `integration_records` table is intended to be populated by an **external
scheduled job**. This application only reads from it — it never writes
integration data.

### Data model

- `users` — login accounts (username, password_hash, role)
- `accounts` — customer accounts (e.g. "Aarke USA (Amazon)")
- `user_accounts` — which accounts each user may view (many-to-many)
- `integration_records` — ONE row per record (account + integration type +
  record id) holding its **latest outcome** and an attempt count; fed by
  `POST /api/recordimport/fromflowgear`. Request/response payloads are cleared after 24 hours.

---

## Local setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
#    Fill in DATABASE_URL (Railway) and generate AUTH_SECRET:
#    openssl rand -base64 32

# 3. Apply the database schema
npm run db:migrate

# 4. Seed the first admin user + sample accounts/records
npm run db:seed

# 5. Run
npm run dev
```

Then open http://localhost:3000 and sign in with the seeded admin credentials
(SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD from your .env).
**Change the admin password after first login.**

---

## Railway (Postgres) setup

1. In Railway, create a new project and add a **PostgreSQL** database.
2. Open the Postgres service, go to the Connect/Variables tab, and copy the
   connection string (use the public/pooled URL if connecting from an external
   host such as Vercel).
3. Put it in .env as DATABASE_URL.
4. Run `npm run db:migrate` then `npm run db:seed` (locally against the Railway
   DB, or as a one-time deploy step) to initialise the schema and admin user.

## Deploying the app

The app is a standard Next.js project and runs on either platform:

**Vercel**
1. Import the GitHub repo at vercel.com.
2. Add environment variables: DATABASE_URL, AUTH_SECRET, and optionally
   SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD.
3. Deploy. Run migrations/seed once against the Railway DB.

**Railway (app + db together)**
1. Add a service from the GitHub repo alongside the Postgres service.
2. Set the same environment variables (reference the Postgres service URL).
3. Railway builds and starts it (npm run build / npm start).

> Migrations and seeding are one-time steps run against the database, not part
> of the normal request path.

---

## Scripts

| Script                | Purpose                                  |
|-----------------------|------------------------------------------|
| npm run dev           | Local dev server                         |
| npm run build         | Production build                         |
| npm run start         | Start production server                  |
| npm run db:generate   | Regenerate SQL migrations from schema    |
| npm run db:migrate    | Apply migrations to the database         |
| npm run db:seed       | Create admin user + sample data          |
| npm run monitor       | Optional pull job: source -> integration_records |
| npm run purge         | Clear payloads older than PAYLOAD_CLEAR_AFTER_HOURS |

---

## Ingest API (Flowgear → dashboard)

Flowgear workflows push each record outcome (the point where they set their
Key-Value to Success or Error) to:

```
POST /api/recordimport/fromflowgear
Authorization: Bearer <FLOWGEAR_IMPORT_BEARER_TOKEN>
Content-Type: application/json
```

Body: one record, an array, or `{ "records": [...] }` (max `FLOWGEAR_IMPORT_MAX_RECORDS_PER_REQUEST`).

| Field | Required | Notes |
|---|---|---|
| `accountName` | yes | Created automatically if new (`FLOWGEAR_IMPORT_AUTO_CREATE_ACCOUNTS`) |
| `integrationType` | yes | Record type, e.g. `Sales Order`, `Inventory Update` |
| `recordId` | yes* | Unique key within account + type, e.g. the Key-Value key. *Falls back to `orderReference` |
| `status` | yes | `Success` or `Failed` (`Error` is accepted as Failed). `InProgress` is ignored |
| `orderReference` | | e.g. `#3446059` |
| `workflow` | | Flowgear workflow name |
| `direction` | | `In` / `Out` (also inbound/outbound) |
| `system`, `businessUnit` | | |
| `responseCode` | | Integer HTTP/API code |
| `responseDescription` | | Up to 2,000 chars |
| `requestPayload`, `responsePayload` | | String or JSON; truncated at `PAYLOAD_TRUNCATE_AFTER_CHARS` |
| `timestamp` | | ISO 8601; defaults to now |

Example:

```json
{
  "accountName": "Outnet",
  "integrationType": "Sales Order",
  "recordId": "#3446836-22255000000000",
  "orderReference": "#3446836",
  "workflow": "Outnet (Web) - In - Sales Order",
  "direction": "In",
  "system": "CloudX",
  "status": "Failed",
  "responseCode": 400,
  "responseDescription": "UPC WP26LBZ005.BLACK.4 is not in the product style master",
  "requestPayload": { "pickTicketNumber": "22255000000000" },
  "responsePayload": { "status": 400 }
}
```

Response: `{ "received": n, "upserted": n, "skipped": [{ "index", "recordId", "reason" }] }`.

### Storage rules (kept deliberately small)

- **Latest outcome only.** A unique index on (account, integration type,
  record id) means each record is one row. A new outcome overwrites it and
  adds 1 to `attempt_count`; the log shows `RETRIES` = attempts − 1. The table
  grows with distinct records, not with retries.
- **Out-of-order safe.** An outcome older than the stored one only increases
  the count; it never replaces a newer result.
- **24-hour payloads.** `request_payload` / `response_payload` are cleared
  `PAYLOAD_CLEAR_AFTER_HOURS` after they were stored. The status, code,
  description and count stay. Purge runs inside ingest (at most every 10 min
  per server) and via `npm run purge` — schedule that hourly as a safety net
  (e.g. Railway Cron `0 * * * *`). A partial index keeps it cheap.
- **Payloads are never loaded in lists.** The Integration Log fetches them only
  when a row is opened (`GET /api/records/:id`, account-scoped).

### Migration note

`0001_latest_outcome_ingest` collapses existing duplicate rows into the latest
one per record (carrying the count) before creating the unique index. Clear
old mock data first if you don't want it kept: `DELETE FROM integration_records;`

## External monitor job (optional)

The dashboard only *reads* `integration_records`. That table is populated by
this repo's **monitor job**, run on a schedule:

```bash
npm run monitor
```

### How it works

1. **Checkpoint** — reads `max(timestamp)` from `integration_records` as the
   high-water mark. On the first run (empty table) it pulls the last
   `MONITOR_LOOKBACK_HOURS` hours.
2. **Fetch** — asks the configured *source adapter* for events after the
   checkpoint.
3. **Normalise** — validates `timestamp`/`integrationType`, maps `status` to
   `Success`/`Failed` and `direction` to `In`/`Out`, and resolves each
   `accountName` to an `accounts.id` (creating the account if
   `MONITOR_CREATE_ACCOUNTS=true`).
4. **De-duplicate** — drops events at/-before the checkpoint and any that
   already exist (keyed on account + integrationType + recordId + timestamp),
   so reruns and equal-timestamp boundaries never double-insert. No schema
   change is required.
5. **Insert** — batch-inserts the remaining rows.

It never updates or deletes existing rows, and only ever writes to
`integration_records` (plus `accounts`, when creating a missing one).

### Sources

Select with `MONITOR_SOURCE`:

- `mock` (default) — emits a small deterministic batch, no external
  dependency. Use it for local testing and dry runs.
- `http` — GETs a JSON array of events from `MONITOR_SOURCE_URL`, passing the
  checkpoint as a query param and an optional `Bearer` token. If your upstream
  nests the array, point `MONITOR_SOURCE_ROOT` at it (e.g. `data.events`). The
  endpoint should return objects shaped like the event fields
  (`timestamp`, `accountName`, `businessUnit`, `system`, `direction`,
  `integrationType`, `recordId`, `status`, `response`). To integrate a source
  with different field names, add an adapter under `src/jobs/sources/`
  implementing the `MonitorSource` interface in `src/jobs/types.ts`.

All monitor settings live in `.env` (see `.env.example`).

### Dry run

Preview what would be written without touching the database:

```bash
MONITOR_DRY_RUN=1 npm run monitor
```

### Scheduling

Run `npm run monitor` on whatever cadence you need. Because the checkpoint is
derived from the database, overlapping or missed runs are safe.

**cron (self-hosted)**

```cron
*/5 * * * * cd /path/to/integration_dashboard && /usr/bin/npm run monitor >> /var/log/int-monitor.log 2>&1
```

**Railway** — add a *Cron* service pointing at this repo with the start command
`npm run monitor` and the schedule expression (e.g. `*/5 * * * *`). Reference
the same `DATABASE_URL` as the Postgres service.

**GitHub Actions**

```yaml
# .github/workflows/monitor.yml
name: integration-monitor
on:
  schedule:
    - cron: "*/5 * * * *"
  workflow_dispatch:
jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run monitor
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          MONITOR_SOURCE: http
          MONITOR_SOURCE_URL: ${{ secrets.MONITOR_SOURCE_URL }}
          MONITOR_SOURCE_TOKEN: ${{ secrets.MONITOR_SOURCE_TOKEN }}
```

---

## Project structure

```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── layout.tsx           # auth guard + shell
│   │   ├── overview/            # Account Overview
│   │   ├── integration-log/     # Integration Log
│   │   └── users/               # User management (admin)
│   ├── api/
│   │   ├── auth/{login,logout}/
│   │   ├── users/               # list/create/update/delete
│   │   └── accounts/
│   ├── login/
│   ├── globals.css              # retro theme
│   └── layout.tsx
├── components/Shell.tsx         # sidebar + topbar + theme toggle
├── db/                          # schema, client, migrate, seed
├── jobs/                        # external monitor job (writes integration_records)
│   ├── monitor.ts               # orchestrator (npm run monitor)
│   ├── types.ts                 # RawEvent + MonitorSource interface
│   └── sources/                 # http + mock source adapters
├── lib/auth.ts                  # session helpers
└── middleware.ts                # route protection

drizzle/                         # generated SQL migrations
mockups/                         # original static HTML mockups (reference)
```

---

## Security

Keep this checklist in mind when working on the project:

**Secrets and environment variables**
- Never commit secrets. `DATABASE_URL` and `AUTH_SECRET` live only in `.env`
  locally (gitignored) and in the hosting platform's environment variables
  (Railway / Vercel) in deployment.
- Generate `AUTH_SECRET` with `openssl rand -base64 32` and use a different
  value per environment. Rotating it invalidates all existing sessions.
- `.env.example` is the only env file in the repo — it holds placeholders, not
  real values.

**Credentials**
- Passwords are stored only as bcrypt hashes, never in plain text.
- Change the seeded admin password immediately after first login.
- Session tokens are signed JWTs stored in httpOnly, SameSite=Lax cookies
  (Secure in production), so they are not readable by client-side JavaScript.

**GitHub access tokens**
- Prefer **fine-grained** personal access tokens scoped to only this repository
  over classic tokens with full `repo` access.
- Set a short expiration rather than "no expiration."
- Revoke a token as soon as it is no longer needed
  (GitHub → Settings → Developer settings → Personal access tokens).
- Never paste tokens into code, commits, issues, or shared chats. If one is
  ever exposed, revoke it and generate a new one.

**Access control**
- The `users` menu and all user-management APIs are admin-only, enforced
  server-side (not just hidden in the UI).
- Non-admin users only see data for the accounts explicitly assigned to them;
  account scoping is applied in the database queries, not the client.
