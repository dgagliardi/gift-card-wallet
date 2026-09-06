# Gift Card Wallet: Node 24.20.0 / Webuzo migration

Status: preparation only. This change does not authorize a production action.
Target is exactly **24.20.0**, with pnpm **9.15.0**, not a floating major or LTS alias.
Node 20.20.2 is retained only for a rehearsed rollback.

## Known facts and scope

The coordinator supplied these production facts; this audit did not connect to
production or inspect operational files:

- PM2 app `giftcard`, one instance, fork mode, cwd at the nested `apps/web`.
- The checksum-verified target is `/home/brenni6/.local/node-v24/bin/node`.
- The production checkout is dirty: an old spreadsheet is deleted, a new
  spreadsheet is untracked, and ecosystem configuration and logs are operational
  artifacts. Their contents and the actual storage paths remain uninspected.
- Existing PM2 daemon and startup service are separate from the app interpreter.

No merge, deployment, PM2 restart, daemon/startup change, secret inspection,
production reconciliation, or cleanup is part of this PR. Do not add the deploy
trigger to a commit or merge message. The ordinary deploy workflow is **not the
first-migration procedure**: it installs in place and replaces `.next`, so it
cannot create the rollback set described below. It remains disabled until an authorized coordinator records repository variable
`GIFTCARD_NODE24_MIGRATION_ACCEPTED=true` after migration acceptance. This task
does not set that variable; it is an operational latch, not proof or approval by
itself. Its dirty-check gate also blocks the known checkout, or an unreadable
checkout state, before pull/install/build/restart. Do not bypass it with
stash/reset/clean, an ignore rule, or a forced checkout.

## Source audit and native dependencies

The lockfile is unchanged. No dependency upgrade or wallet/schema change is
needed by the local Node 24 checks. Resolved versions in `pnpm-lock.yaml`:

| Dependency | Where it matters | Migration treatment |
| --- | --- | --- |
| `better-sqlite3` 12.8.0 | Every database open; native V8 addon | Install separately under each exact Node runtime. Never reuse Node 20's `.node` file under Node 24 or vice versa. |
| `sharp` 0.34.5 and `@img/*` / libvips | Next image processing, included in standalone | Validate the artifact's actual native module on the target OS/architecture/libc. |
| `@next/swc-*` 15.5.14 | Next compiler | Select Linux packages on Linux; a macOS build is not a deployable VPS artifact. |
| `@tailwindcss/oxide` 4.2.2, `lightningcss` 1.32.0 | CSS build | Platform-native build dependencies; require a clean install on the build host. |
| `esbuild` 0.18.20 / 0.25.12 / 0.27.7, Rolldown/Oxc bindings, `unrs-resolver` | Build, tests, schema tooling, lint | Native executables/bindings also need correct platform selection; do not omit optional dependencies. |
| `tesseract.js` 7.0.0 / `tesseract.js-core` | Browser OCR, WebAssembly | No PM2 server OCR addon. Camera/OCR behavior is not exercised by the runtime smoke. |

Node-API can offer ABI stability, but that does not make every addon portable;
see [Node addon guidance](https://nodejs.org/api/addons.html#node-api) and
[Sharp installation requirements](https://sharp.pixelplumbing.com/install/).
Local Node 24.20.0 reports module ABI **137**. The target host's glibc, compiler
and native modules were exercised in the disposable canary below. Real Google
OAuth remains a migration acceptance gate. The workflow now uses the exact
Python 3.11 / GCC 12 toolchain proven by that canary rather than an older
installed fallback.

## Interpreter and storage contract

The committed template pins `interpreter` to the supplied **absolute** Node 24
binary. [PM2 documents this field separately from cwd and the daemon](https://pm2.keymetrics.io/docs/usage/application-declaration/).
Changing a login shell's Node or updating PM2 is not an app-runtime migration.
Keep `giftcard`, fork mode, one instance, and the existing nested `apps/web` cwd.
The script stays `.next/standalone/apps/web/server.js`; `--env-file=.env` loads
relative to the launch cwd before Next runs.

The generated standalone `server.js` calls `process.chdir(__dirname)`.
`lib/db.ts` and `lib/paths.ts` otherwise default storage from `process.cwd()`.
Therefore, **preserve verified absolute DATABASE_PATH and UPLOADS_PATH** across
both runtimes. Do not infer them from the PM2 cwd or assume `apps/web/data` is
the currently active location. A guessed path can silently create an empty wallet.
The template uses conspicuous storage placeholders requiring operator replacement;
do not run it as supplied or overwrite the machine's existing ecosystem config.
Preserve all existing operational settings and reconcile only the interpreter and
verified absolute data settings in a separately approved config change.
Environment values already supplied by PM2 take precedence over Node's env file;
check effective path equality without printing secrets or full environment dumps.

A later authorized operator must verify the target binary version and hash,
`giftcard`'s configured interpreter, the running PID's executable (Linux
`/proc/<pid>/exe`), cwd/script/fork settings and effective storage identity.
A PM2 status of "online" alone is not sufficient. Do not use `pm2 update`,
`pm2 kill`, `pm2 startup`, or global restart commands for this app change.
A future persistence/save step also needs coordination because it affects the
shared PM2 process list. This PR does not change daemon or boot persistence.

## Reproduce locally or in a clean CI checkout

Use only a clean disposable checkout with no production env files or data.
From the repository root, with the exact Node binary first on PATH:

```sh
node --version                         # must be v24.20.0
pnpm --version                         # must be 9.15.0
pnpm install --frozen-lockfile
pnpm test
pnpm --filter @gift-card-wallet/domain exec tsc
pnpm --filter @gift-card-wallet/web lint
TASK_DATA=$(mktemp -d)
DATABASE_PATH="$TASK_DATA/wallet.db" \
UPLOADS_PATH="$TASK_DATA/uploads" \
pnpm build
pnpm --filter @gift-card-wallet/web smoke:standalone
```

Build imports initialize SQLite and can run `ensureWalletSchema`; never point a
build at live data. The CI workflow and future deployment build explicitly use
disposable absolute paths. These variables apply only to the build, not the
app's runtime data configuration.

The smoke script copies the complete standalone artifact outside the workspace,
copies public/static assets, loads the packaged `better-sqlite3` and Sharp, and
checks SQLite WAL/write/reopen/backup/integrity plus PNG encode/decode. It launches
the server with the exact current executable and a synthetic env file from a
nested `apps/web` cwd, binds loopback only, and checks login, JS assets, PWA,
auth startup and upload protection with bounded HTTP timeouts. It bootstraps the real schema into the synthetic database, creates a synthetic
email/password account, opens the authenticated wallet and reads a synthetic
image from the absolute upload path with exact byte comparison. It verifies
that no fallback database/upload directory appears under standalone cwd.
Google OAuth, real user data and camera/OCR remain outside this smoke.
All temporary artifacts are retained for inspection. It refuses source checkouts
with operational env filenames and neither loads operational
env files nor contacts production, Google OAuth, or PM2.

## Gates for a separately authorized migration

1. Record the accepted candidate commit and frozen lockfile hash. Preserve the
   production dirty checkout and operational artifacts as found; obtain a concrete
   reconciliation plan with ownership before changing them. Do not pull this PR
   into that checkout as a workaround. Use a separate candidate release directory.
2. Preserve a usable old release: exact source/config, complete `.next/standalone`
   (including nested native modules), `.next/static`, public assets, workspace
   dependencies if needed for rebuild, and the exact old Node 20.20.2 executable.
   Record its **verified absolute path**; this audit does not know it on Webuzo.
   A Git SHA or lockfile alone is not a usable binary rollback. Keep old and new
   dependency/build trees separate. Verify the old artifact still loads its own
   Node 20 SQLite binding before permitting a cutover.
3. Rehearse both artifacts on synthetic data using their own Node versions on a
   matching Linux host, including the Node 24 startup path and full app routes.
   The Node 24 artifact passed this on Webuzo; the preserved Node 20 rollback
   artifact still needs an equivalent target-host rehearsal.
   Never copy macOS/Ubuntu native artifacts into production as proof of this gate.
4. Under an approved maintenance window, quiesce all wallet writers (including
   import jobs), then produce a coherent database **and uploads** checkpoint.
   Use SQLite's backup API (see [better-sqlite3 backup](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#backupdestination-options---promise))
   or a verified checkpoint with all connections closed. Do not copy only a live
   `.db` while committed data remains in `-wal`. Preserve the source database,
   WAL/SHM state as applicable, uploads, ownership/modes, and private configuration
   in a protected rollback set; verify the restored copy's integrity and image
   references without disclosing card data or secrets. Coordinate database and
   uploads at the same writer-free boundary.
5. Build the candidate with isolated build data; configure the separately reviewed
   app interpreter and verified absolute runtime data paths. Apply the config to
   **only `giftcard`** after explicit cutover approval. A name-only restart with
   an edited template on disk does not establish that config was applied.
6. Before reopening writes, verify interpreter/PID identity, restart stability,
   no ABI/module-load errors, existing wallet counts/balances/categories, login,
   Google OAuth, a protected image, and a reversible synthetic transaction/upload
   under an approved test account. Preserve sanitized receipts and a rollback
   decision deadline. Failure or uncertainty means stop and use the approved
   rollback; do not retry app/daemon changes speculatively.

## Rollback: binaries and data must remain coherent

The migration changes runtime/configuration only. There is no schema change in
this PR, but boot already runs schema convergence, so backup before first boot.

- **Runtime failure before reopening writes:** stop the candidate under the
  approved window. Restore/select the preserved Node 20 release, its own Node 20
  native dependencies (including the standalone copy), previous operational
  config and verified absolute interpreter. Keep the same verified database and
  uploads if rehearsal proves them unchanged/compatible. Verify integrity and
  existing wallet behavior before reopening writes. Merely pointing Node 20 at
  Node 24's dependency tree is not rollback.
- **Data restore required:** keep writers stopped, preserve the failed candidate's
  data for diagnosis, and restore the matched database + uploads checkpoint to a
  separate verified location. Restore ownership/modes and point the old release
  to both restored absolute paths together. Never mix a restored database with
  stale WAL/SHM files or a different-time upload tree.
- **Writes accepted after cutover:** runtime-only rollback may preserve the
  current database/uploads after compatibility verification. A checkpoint restore
  would discard those writes. Stop, retain both states, obtain a reconciliation
  and data-loss decision, and do not silently overwrite current data. Database
  integrity alone does not prove account balances or image references are right.

## Evidence and remaining blockers

Local baseline at `ab1f19b`: exact Node 24.20.0, Darwin arm64, ABI 137; frozen
install, 39 existing tests, domain typecheck, web lint, and production build passed.
The copied standalone smoke passed with its packaged SQLite and Sharp modules.
A separate local `better-sqlite3` 12.8.0 install under Node 20.20.2 (ABI 115)
read/updated a synthetic WAL database created by Node 24; Node 24 then verified
the update and integrity. The negative control confirmed Node 20 rejects the
Node 24 SQLite binding. This is a local data-format comparison, not a Webuzo
rollback rehearsal. See the PR review notes for final-head checks.
Build warnings include existing Browserslist staleness and the jose Edge
CompressionStream/DecompressionStream warning. A build without private auth
configuration also warns about the development fallback secret; no production
secret was read to suppress it.

Activation remains blocked on authorized Webuzo candidate validation, verified
live data/config identity, dirty-checkout reconciliation, a tested Node 20 binary
rollback and matched data backup, coordinated cutover approval and app acceptance.
No work in this PR claims those gates are met.

## Target-host validation receipt — 2026-09-06

Exact head `2ac7c332b078553a2d60a2dccc82d785c039fdcc` passed in a
trap-cleaned checkout on the actual AlmaLinux 8.10 / glibc 2.28 host using Node
24.20.0, pnpm 9.15.0, Python 3.11.13, and GCC 12.2.1. The frozen install detected
that the downloaded `better-sqlite3` binary required glibc 2.29 and successfully
source-built the locked 12.8.0 addon for the host instead. All 48 tests, domain
typecheck, web lint, and the production Next standalone build passed.

The copied standalone artifact then passed SQLite WAL/write/reopen/backup and
integrity checks, Sharp PNG encode/decode, synthetic signup and wallet access,
static/PWA asset loading, authenticated image retrieval, and unauthenticated
upload denial. All database, uploads, env files, build outputs and retained smoke
artifacts lived below one exact disposable directory removed by the coordinator's
trap. No operational env file, card data, production process, PM2 state, or Google
OAuth flow was accessed.
