#!/usr/bin/env bash
set -euo pipefail

test "$(uname -s)" = "Linux"
test -x "${CC:-}"
test -x "${CXX:-}"
test -x "${npm_config_python:-}"

# The packaged Linux prebuild requires glibc 2.29. Version 13 prefers that
# prebuild even when a local build exists, so force its source-build script and
# remove the incompatible prebuilds before validating runtime selection.
package_root=$(node - <<'NODE'
const path = require("node:path");
const { createRequire } = require("node:module");
const requireFromApp = createRequire(`${process.cwd()}/apps/web/package.json`);
process.stdout.write(path.dirname(requireFromApp.resolve("better-sqlite3/package.json")));
NODE
)
npm --prefix "$package_root" run build-release
find "$package_root/prebuilds" -type f -delete
test -f "$package_root/build/Release/better_sqlite3.node"

node - <<'NODE'
const { createRequire } = require("node:module");
const requireFromApp = createRequire(`${process.cwd()}/apps/web/package.json`);
const Database = requireFromApp("better-sqlite3");
const db = new Database(":memory:");
if (db.pragma("integrity_check", { simple: true }) !== "ok") process.exit(1);
db.close();
NODE
