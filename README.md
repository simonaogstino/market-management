# Market Management

Single web app for **admin** and **POS** — runs in the browser on Windows PCs, works offline for a few hours, syncs when online.

## Quick start (2 steps)

**Prerequisite:** [Node.js 20+](https://nodejs.org/) only — no Docker, no PostgreSQL install.

```powershell
cd C:\Users\simon\Projects\market-management
```

**Windows (easiest):** double-click or run:

```cmd
setup.bat
dev.bat
```

**Or in terminal** (if PowerShell blocks npm, use `npm.cmd`):

```cmd
npm.cmd run setup
npm.cmd run dev
```

Open in Chrome or Edge:

| Screen | URL | Login |
|--------|-----|-------|
| **POS** | http://localhost:3000/pos | API key: `pos-terminal-1-key` |
| **Admin** | http://localhost:3000/admin | `admin@store.local` / `admin123` |

Second POS terminal: use API key `pos-terminal-2-key` on another PC/browser.

---

## Multi-POS on Windows PCs

Each PC opens **http://your-server:3000/pos** in the browser (bookmark it). No extra software.

- **Online:** sales sync immediately
- **Offline:** sales save in the browser; sync when internet returns

---

## Default credentials

| Role | Details |
|------|---------|
| Admin | `admin@store.local` / `admin123` |
| POS 1 | `pos-terminal-1-key` |
| POS 2 | `pos-terminal-2-key` |

---

## Optional: PostgreSQL (production)

For production you can switch to PostgreSQL. Update `packages/database/prisma/schema.prisma` provider to `postgresql`, set `DATABASE_URL` in `.env`, then run `pnpm db:push`.

Or use Docker: `docker compose up -d` (requires Docker Desktop running).

---

## GoDaddy / Airo deployment

The app is running, but you must set **Secrets** in Airo → **Settings → Secrets**:

| Secret | Example |
|--------|---------|
| `DATABASE_URL` | `file:/app/packages/database/prisma/prod.db` |
| `NEXTAUTH_SECRET` | long random string (32+ characters) |
| `NEXTAUTH_URL` | `https://your-domain.com` |

GoDaddy's built-in database credentials use different variable names — Prisma needs **`DATABASE_URL`** specifically. Either:

- **SQLite (simplest):** use `file:/app/packages/database/prisma/prod.db` as above, or
- **MySQL/Postgres:** build a connection string, e.g. `mysql://user:pass@host:3306/dbname`

On each deploy, `npm start` runs `db:push` and `db:seed` automatically so tables and the admin user are created.

After adding secrets, **redeploy** the app.

---

## Project layout

| Path | Purpose |
|------|---------|
| `apps/web` | Admin + POS + API (all web) |
| `packages/database` | Database schema (SQLite file: `packages/database/prisma/dev.db`) |
