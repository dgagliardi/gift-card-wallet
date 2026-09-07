#!/usr/bin/env bash
set -euo pipefail

test "$(uname -s)" = "Linux"
test -x "${CC:-}"
test -x "${CXX:-}"
test -x "${npm_config_python:-}"

# The locked Linux prebuild requires glibc 2.29. Force the package install
# script down its node-gyp path so the EL8/glibc 2.28 candidate receives a
# binary built with the explicitly selected Python 3.11 and GCC 12 toolchain.
npm_config_build_from_source=true \
  pnpm --filter @gift-card-wallet/web rebuild better-sqlite3

node - <<'NODE'
const { createRequire } = require("node:module");
const requireFromApp = createRequire(`${process.cwd()}/apps/web/package.json`);
const Database = requireFromApp("better-sqlite3");
const db = new Database(":memory:");
if (db.pragma("integrity_check", { simple: true }) !== "ok") process.exit(1);
db.close();
NODE
