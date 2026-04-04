# Universal Gift Card & Prepaid Wallet

A lightweight, mobile-friendly way to track physical and digital gift cards, prepaid cards, and store credits. This repository supports **two deployments**:

| Deployment | Location | Data |
|------------|----------|------|
| **Google Sheets** | [apps/sheets/](apps/sheets/) — copy `Code.gs` and `Index.html` into Apps Script | Your Google Sheet + Drive |
| **VPS / self-hosted** | [apps/web/](apps/web/) — Next.js, SQLite, local file uploads | `DATABASE_PATH` + `UPLOADS_PATH` on disk |

Shared **domain logic** (wallet stats, balance rules) lives in [packages/domain/](packages/domain/) and is covered by unit tests. The Sheets app reimplements the same behavior in Apps Script; if you change stats or balance rules in `packages/domain`, update `apps/sheets/Code.gs` accordingly and run `pnpm test` before merging.

### Features

- Physical and digital cards, balances, transactions, archive, spending stats (same behavior as the original Sheets app).
- **VPS:** [better-auth](https://www.better-auth.com/) with **Google OAuth** (recommended), optional email/password, Drizzle + SQLite, optional PWA. Digital card **photos** are stored on the server and shown in the list and detail views for checkout.

---

## Monorepo layout

```text
gift-card-wallet/
  package.json              # pnpm workspaces
  apps/
    sheets/                 # Google Apps Script (Code.gs, Index.html)
    web/                    # Next.js app for VPS
  packages/
    domain/                 # Zod types + computeWalletStats + balance helpers + Vitest
```

**Commands (from repo root):**

- `pnpm install` — install all workspaces
- `pnpm dev` — Next dev server (`apps/web`)
- `pnpm build` — production build of `apps/web`
- `pnpm test` — run `packages/domain` tests
- `pnpm db:push` — apply Drizzle schema (creates `apps/web/data/` if needed)

---

## Google Sheets deployment

### Phase 1: Database setup (Google Sheets)

1. Create a Google Sheet named **Gift Card Tracker**.
2. Rename the first sheet to **Cards** and set row 1 (columns A–J):  
   `Card ID`, `Brand`, `Type`, `Date Added`, `Initial Balance`, `Image URL`, `Card Number`, `PIN`, `Check Balance URL`, `Archived`
3. Add a second sheet **Transactions** with row 1 (A–E):  
   `Date`, `Card Id`, `Amount Deducted`, `Remaining Balance`, `Note`

### Phase 2: Apps Script

1. **Extensions → Apps Script**
2. Paste all contents from [apps/sheets/Code.gs](apps/sheets/Code.gs) into `Code.gs`
3. Add an HTML file named **Index** (capital I) and paste [apps/sheets/Index.html](apps/sheets/Index.html)
4. Deploy as a **Web app** (Execute as: Me, access: Only yourself)

---

## VPS deployment (`apps/web`)

1. **Environment** — copy [apps/web/.env.example](apps/web/.env.example) to `apps/web/.env.local` and set:
   - `BETTER_AUTH_SECRET` — use at least 32 random bytes (e.g. `openssl rand -base64 32`)
   - `BETTER_AUTH_URL` — must match how users reach the app (e.g. `https://wallet.example.com` — no trailing slash; include `NEXT_PUBLIC_BASE_PATH` in the site URL if you use one)
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` — from [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (OAuth 2.0 Client ID, type **Web application**). Under **Authorized redirect URIs**, add:
     - `https://YOUR_DOMAIN/api/auth/callback/google`
     - For local dev: `http://localhost:3000/api/auth/callback/google` (adjust port if needed)
   - `DATABASE_PATH` — SQLite file path (default: `./data/gift-card-wallet.db` under `apps/web`)
   - `UPLOADS_PATH` — directory for card images (default: `./data/uploads`)
   - `NEXT_PUBLIC_BASE_PATH` — if served behind a subpath (e.g. `/wallet`)
   - Optional: `ENABLE_EMAIL_PASSWORD=true` to allow email/password sign-in in addition to Google (or as a dev fallback when Google keys are not set, email/password is enabled automatically)

2. **Database:** from repo root: `pnpm db:push`

3. **First run:** open `/setup`. With Google configured, use **Continue with Google**; the **first** user to sign in becomes **admin**. Without Google keys, the setup form falls back to email/password (dev-only convenience).

4. **Production:** `pnpm build` then `pnpm start` in `apps/web` (Node). Optional: Docker with `output: "standalone"` and a persistent volume for `data/`.

---

## Dual-deployment checklist (PRs)

When changing wallet behavior:

- [ ] Updated `packages/domain` and `pnpm test` passes
- [ ] If stats/balance logic changed, updated `apps/sheets/Code.gs` to match
- [ ] If API or fields changed, updated `apps/web` Drizzle schema and UI as needed

---

## Mobile (Sheets web app)

Open the deployed Web app URL on your phone and **Add to Home Screen** (Safari / Chrome) for a PWA-like shortcut.
