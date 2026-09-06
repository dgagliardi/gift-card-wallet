# PR #17 review notes — Node 24.20.0 preparation

## Risk tier
HIGH: runtime/deployment errors could cause outage or select an empty wallet.

## Review mode (Standard / Deep)
Deep: primary hostile pass plus independent cross-file, failure-propagation and
test-proof reviewers, followed by one targeted correction/acceptance pass.

## Author-review protocol applied
YES. Raw-diff behavior: pins runtime/configuration, constrains future deployment,
and adds isolated native/server verification. Matches the draft description.
Author tier escalated from MEDIUM to HIGH; cold reviewers received the raw staged
diff without task history or PR description. This is preparation, not activation.

## Tier escalations
Runtime/PM2/data-path outage impact is HIGH despite no application schema change.

## PR intent
Prepare exactly Node 24.20.0 with an absolute app interpreter independent of the
PM2 daemon and a coherent native/data rollback; leave production untouched.

## What changed
Runtime pins; explicit PM2 interpreter/storage template; default-off automated
migration acceptance latch; fail-closed checkout guard; frozen dependency install;
isolated build storage; app-only explicit-interpreter restart for future approved
deployments; regression tests, standalone smoke and operational runbook.

## Root cause trace
Implicit interpreter/PATH -> install/build and app may select different Node ABIs
-> native SQLite cannot load. Template/CI/workflow pin the runtime explicitly.
Next standalone changes cwd -> default relative storage can select a fresh wallet
-> require verified absolute DB/upload paths and test them after standalone boot.
Build imports db.ts -> schema bootstrap can write live data -> build-only temp paths.

## Scope audit
| File | Purpose |
| --- | --- |
| `.nvmrc`, root `package.json` | Exact developer runtime contract; pnpm unchanged |
| `.github/workflows/ci.yml` | Exact Linux CI runtime, frozen install, isolated build, smoke |
| `.github/workflows/deploy.yml` | Future deployment gating/runtime/checkout/build protection |
| `apps/web/package.json` | Smoke command only; no release version change |
| `apps/web/scripts/ecosystem.config.js.template` | Absolute interpreter and explicit existing storage placeholders |
| `apps/web/scripts/smoke-standalone.mjs` | Synthetic packaged-native and HTTP verification |
| `apps/web/lib/runtime-config.test.ts` | Runtime/PM2 configuration contract |
| `apps/web/lib/deploy-workflow.test.ts` | Actual shell with inert commands and negative paths |
| `README.md`, `docs/node-24-migration.md` | Reproduction and migration/rollback requirements |
| `docs/qa/pr17-review-notes.md` | Review/evidence receipt |

## Challenge
A local macOS build is not a Linux release artifact. Ubuntu CI is not proof of
Webuzo glibc/compiler compatibility. A placeholder-filled template must never be
applied. Runtime-only rollback still requires old native binaries and data proof.
These limits are explicit in the runbook and leave activation blocked.

## What was not changed that should have been
None within preparation scope. Production config/data, daemon/startup, acceptance
variable and checkout reconciliation deliberately require separate authority.
The existing ordinary deploy remains an in-place procedure; it is not the first
migration or rollback packaging mechanism.

## Regression risks
Initial BLOCKING: checkout status command failure could pass the dirty gate.
Initial BLOCKING: workflow safeguards had no executable regression coverage.
Initial NON-BLOCKING: 401-only upload test did not exercise absolute storage;
HTTP requests after readiness were unbounded; template env-file argument lacked
coverage; automated deployment needed a default-off migration latch. All fixed.

## Security assessment
No operational files/credentials read or production connections made. Smoke
refuses operational env filenames, uses a new synthetic env/account/data set,
binds loopback, does not inherit credentials/NODE_OPTIONS, and terminates its
own child. Shell tests replace git/pnpm/PM2/copy/remove with inert local stubs.
Real OAuth, account data and Linux process identity remain unverified.

## Rollback feasibility
Local Node 20.20.2 with a separate SQLite 12.8.0 install successfully read/wrote a
Node 24-created synthetic WAL DB, then Node 24 reopened it with integrity intact.
The Node 20 negative control rejected the Node 24 binding (ABI 115 versus 137).
This proves the binary/data distinction locally, not the Webuzo rollback set.
Runbook requires retained old release/native tree, coherent DB+uploads checkpoint,
writer quiescence, absolute storage identity and reconciliation if writes resume.

## Code quality concerns
No unresolved actionable concern after targeted review. No dependency or lockfile
upgrade; no wallet/auth/business-logic or schema change.

## Test coverage gaps
Operational gates remain: Webuzo native install/load; real PM2 configured and
running executable identity; verified real storage paths; protected restore
rehearsal; real OAuth/account/image acceptance. These cannot be tested within the
explicit no-production/no-operational-access scope.

## Open questions
Actual Webuzo Node 20 absolute path and effective data/config identities are
unknown. They are required before activation, not inferred from cwd or templates.

## Initial verdict
NEEDS FIXES for introduced gate/proof gaps. Corrected before draft publication.

## Fixes made
- Status capture now exits on failure before pull/install/build/restart.
- Repo acceptance variable defaults automated deployments off.
- Shell harness covers dirty/unknown state, wrong Node/pnpm versions, frozen
  install, isolated build paths and only-giftcard absolute interpreter.
- Smoke creates real schema and a synthetic session; authenticated image bytes
  must match the file at the absolute upload path; fallback storage is rejected.
- HTTP requests/body reads have abort timeouts; template env-file option asserted.

## Tests added
9 configuration/deployment tests; copied-artifact SQLite WAL/backup/reopen and
Sharp PNG checks; real synthetic signup, wallet/login/static/PWA and authenticated
image retrieval; unauthenticated upload rejection.

## Test execution output
Implementation commit: `f46204b30825a1e36b100c4b79a42177de286617`.
This subsequent commit adds only this review receipt. CI on the draft's final
head is the authoritative Linux result; consult the PR checks for that head.

```text
Node v24.20.0; Darwin arm64; modules ABI 137; pnpm 9.15.0
Frozen install: lockfile up to date
packages/domain: Test Files 4 passed (4); Tests 31 passed (31)
apps/web: Test Files 3 passed (3); Tests 17 passed (17)
Domain tsc: exit 0
Web tsc --noEmit: exit 0
Web eslint: exit 0
Production build: compiled successfully; static pages 10/10; exit 0
Standalone: SQLite WAL/write/reopen/backup/integrity ok
Standalone: Sharp PNG encode/decode ok
Standalone: signup/wallet/login/static/PWA/authenticated image/upload protection ok
Workflow YAML parse and bash -n: pass
Original PM2 template: expected regression failure confirmed
Unknown checkout fail-open mutant: expected regression failure confirmed
Removed build isolation mutant: expected regression failure confirmed
Removed restart interpreter mutant: expected regression failure confirmed
Node20 with Node24 SQLite binding: expected ABI rejection
Node24 -> separate Node20 binding -> Node24 synthetic WAL DB round trip: pass
```

Lockfile SHA256 (unchanged):
`33f02ed6e3328fbff4d64509a8a82fd9d9b7b99ae0733ba96628ddf964a108e3`.
Existing build warnings: stale Browserslist; jose Edge stream warning on the first
build; development fallback auth-secret warnings in builds without private env.
No production secret was accessed to suppress these warnings.

## Documentation audit
| Doc | Status |
| --- | --- |
| README | Updated runtime, reproduction link, test command description |
| Node 24 migration runbook | Added native inventory, PM2/storage, gates, rollback |
| PR review notes | This file |
| PR queue | N/A — no queue document in this repo |
| BUG_RECORD / bug-fixes | N/A — migration preparation, no existing product bug changed |
| Version / changelog | N/A — no release authorized; version remains 0.3.1 |
| Memory | Not updated; no user request to persist memory |
| Transaction-category spec/plan | N/A — unchanged product/schema behavior |

## Skeptical stranger simulation
1. Can unknown checkout state permit writes? Found/fixed; negative test fails on
   the fail-open mutant.
2. Can build or standalone switch storage location? Build isolated; absolute-path
   synthetic DB and authenticated upload checks pass; live identity still gated.
3. Can Node 20 use the replacement native tree? Reproduced ABI failure; rollback
   requires a separate preserved Node 20 release/dependency tree.

## Second-opinion pass
### Cold-read specialist
`cold_review`, `failure_review`, `proof_review`: all reported targeted acceptance
with no introduced actionable regression. Failure reviewer independently ran all
9 new unit tests on Node 24.20.0; others inspected staged source. They did not
claim production proof. Final type-only fixture corrections passed local tsc.
### Self-audit Q1: related files
CI, deployment, template, package metadata, tests and docs are covered. Operational
configuration is intentionally outside authorized access and not guessed.
### Self-audit Q2: root cause
The change addresses interpreter selection and build storage, not merely a restart
symptom. Exact Node install plus copied-artifact native load checks exercise the
actual ABI boundary. Verified production storage still requires an operator.
### Self-audit Q3: revert proof
Retained disposable checkout `/tmp/giftcard-reversal.08MUXD` ran new tests with old
PM2 template and individual workflow mutants. Each expected assertion failed.
No working-tree source was reverted or cleaned for this proof.

## Deferred items
No unresolved code-review findings. Operational acceptance remains blocked by
explicit task boundaries; no follow-on external issue/message or activation was
created. PR intentionally remains draft rather than running skill ready/merge steps.

## Final verdict
Preparation is reviewable in draft; no production GO. Keep activation blocked until
all runbook gates have fresh evidence and explicit coordinated approval.

## Workspace and retention
Branch: `codex/node-24-pm2-migration`.
Worktree: `/Users/dgagliardi/.codex/worktrees/f680/gift-card-wallet` (supplied at start;
no additional Git worktrees created). No production artifact was inspected/moved.
Generated local `node_modules`, `.next`, PWA files and synthetic temporary
`giftcard-node24-*`, `giftcard-node20-rollback.*`, `giftcard-cross-runtime.*`,
`giftcard-reversal.*`, and `giftcard-deploy-test-*` are cleanup candidates after
receipts are no longer needed and cleanup is authorized. Nothing was deleted.
Branch/worktree become retirement candidates only after merge and handoff.
