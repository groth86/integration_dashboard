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
- `integration_records` — integration events (fed by the external job)

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
├── lib/auth.ts                  # session helpers
└── middleware.ts                # route protection

drizzle/                         # generated SQL migrations
mockups/                         # original static HTML mockups (reference)
```
