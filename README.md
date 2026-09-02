# Universal Gift Card & Prepaid Wallet

A lightweight, mobile-friendly way to track physical and digital gift cards, prepaid cards, and store credits. This repository supports **two deployments**:

| Deployment | Status | Location | Data |
|------------|--------|----------|------|
| **VPS / self-hosted** | **Production** | [apps/web/](apps/web/) — Next.js, SQLite, local file uploads | `DATABASE_PATH` + `UPLOADS_PATH` on disk |
| **Google Sheets** | Superseded MVP | [apps/sheets/](apps/sheets/) — copy `Code.gs` and `Index.html` into Apps Script | Your Google Sheet + Drive |

`apps/web` is the production app. The Google Sheets app was the original MVP and is kept as a lightweight reference; it is **no longer maintained in parity** with the web app. See [Sheets divergence](#sheets-divergence).

Shared **domain logic** (wallet stats, balance rules) lives in [packages/domain/](packages/domain/) and is covered by unit tests.

### Features

- Physical and digital cards, balances, transactions, archive, spending stats (same behavior as the original Sheets app).
- **VPS:** [better-auth](https://www.better-auth.com/) with **Google OAuth** (recommended), optional email/password, Drizzle + SQLite, optional PWA. Digital card **photos** are stored on the server and shown in the list and detail views for checkout.
- **Mobile PWA hardening:** the web app uses a standalone manifest, no-pinch viewport, dynamic viewport height, safe-area padding, and mobile-safe 16px form controls for a more app-like installed experience.
- **Card image autofill:** when adding physical cards, the camera can capture a card photo and best-effort extract brand, card number, PIN, and starting balance. When adding digital cards, barcode images are decoded first and then OCR is used for any visible details. Fields remain editable before save.
- **Checkout barcode viewer:** digital card images can be panned and zoomed at checkout time, so full-card screenshots remain usable without pre-cropping.
- Active cards are shown on the home page by default. Archived cards stay hidden behind an Active / Archived switcher when archived cards exist.
- Transactions support refund or credit entries by entering a negative amount, e.g. `-40.74`, which adds value back to the card balance.
- **Spending categories:** every transaction is either **gas** or **merchandise**. The entry form pre-selects it from the card type (physical → gas, digital → merchandise) and one tap overrides it. Tap the chip on any past transaction to reclassify it.
- **Adjustments:** a negative amount is an adjustment correcting an overstated charge. It carries the same category as the charge it corrects and **reduces** that category's totals. "Adjustment" is derived from the sign, never stored.
- **Category stats:** the home page reports gas, merchandise, and total spend year to date.
- **Expenses view:** `/expenses` breaks spending down by year and by month, with adjustments shown as a memo column.
- Existing databases are migrated and backfilled automatically on first boot after deploy — no manual `pnpm db:push` step is required for the category column.

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

### Notes on digital card image upload (mobile)

- The file picker is configured to let mobile users choose from Photos, Files, or Camera (device determines chooser UI).
- OCR extraction runs in-browser (client side) via `tesseract.js`; no OCR text processing is performed on the server.
- On card detail pages, **Show barcode** opens an interactive viewer. Drag to pan, pinch or use the slider to zoom, and tap Reset to restore the default framing. This does not overwrite the saved image.
- Installable PWA behavior is configured through the Next.js manifest route and generated service worker assets. Production deploys should keep `/manifest.webmanifest`, `/sw.js`, and Workbox assets reachable from the app root.

---

## Checklist (PRs)

When changing wallet behavior:

- [ ] Updated `packages/domain` and `pnpm test` passes
- [ ] If API or fields changed, updated `apps/web` Drizzle schema and UI as needed
- [ ] If the schema changed, `apps/web/lib/schema-bootstrap.ts` converges existing databases (the deploy workflow does **not** run `pnpm db:push`)

## Sheets divergence

`apps/sheets` is the superseded MVP and is deliberately **not** kept in sync. Concrete differences today:

- **No categories.** The Sheets app has no gas/merchandise split and no expenses view.
- **Gross vs net spend.** `apps/sheets/Code.gs` skips non-positive amounts, so its year-to-date figure is *gross* of adjustments. The web app nets them. For any wallet containing adjustments, the Sheets total will read **higher** than the web app's.

Do not treat the two totals as reconcilable. `apps/web` is the source of truth.

---

## Mobile

Open the deployed web app URL on your phone and **Add to Home Screen** (Safari / Chrome) for a PWA-like shortcut. The VPS app is optimized for installed mobile use; the Google Sheets web app remains a lightweight fallback.
