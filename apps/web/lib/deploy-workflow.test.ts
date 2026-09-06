import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(new URL("../../../.github/workflows/deploy.yml", import.meta.url), "utf8");
const target = "APP_NODE=/home/brenni6/.local/node-v24/bin/node";

// Execute the actual SSH script with inert local commands; never invokes PM2,
// contacts a remote, or modifies a checkout. Fixtures are retained for inspection.
function execute(extra: Record<string, string | undefined> = {}) {
  const scratch = mkdtempSync(path.join(tmpdir(), "giftcard-deploy-test-"));
  const bin = path.join(scratch, "bin");
  const repo = path.join(scratch, "repo");
  const trace = path.join(scratch, "commands");
  mkdirSync(bin);
  mkdirSync(repo);
  function stub(name: string, body: string) {
    writeFileSync(path.join(bin, name), `#!/bin/bash\n${body}\n`, { mode: 0o755 });
  }
  stub("mktemp", 'test "$1" = -d || exit 1\nmkdir "$TEST_SCRATCH/giftcard-build.fixture"\nprintf "%s\\n" "$TEST_SCRATCH/giftcard-build.fixture"');
  stub("node", 'printf "v%s\\n" "${TEST_NODE_VERSION:-24.20.0}"');
  stub("pnpm", `if [ "$1" = --version ]; then printf '%s\\n' "\${TEST_PNPM_VERSION:-9.15.0}"; exit 0; fi
printf 'pnpm %s | db=%s | uploads=%s\\n' "$*" "$DATABASE_PATH" "$UPLOADS_PATH" >> "$TEST_TRACE"`);
  stub("git", `if [ "$1" = status ]; then
  if [ "$TEST_CHECKOUT" = unknown ]; then exit 128; fi
  if [ "$TEST_CHECKOUT" = dirty ]; then printf ' D operational.xlsx\\n'; fi
  exit 0
fi
printf 'git %s\\n' "$*" >> "$TEST_TRACE"`);
  for (const command of ["rm", "cp", "pm2"]) {
    stub(command, `printf '${command} %s\\n' "$*" >> "$TEST_TRACE"`);
  }
  expect(workflow).toContain(target);
  const script = workflow.split("          script: |\n")[1]
    .replace(/^            /gm, "")
    .replace(target, `APP_NODE=${bin}/node`)
    .replace("${{ secrets.DEPLOY_PATH }}", repo);
  const result = spawnSync("/bin/bash", ["--noprofile", "--norc", "-c", script], {
    env: { NODE_ENV: "test", PATH: `${bin}:/usr/bin:/bin`, TMPDIR: scratch, TEST_TRACE: trace, TEST_SCRATCH: scratch,
      DATABASE_PATH: "/synthetic-live/wallet.db", UPLOADS_PATH: "/synthetic-live/uploads", ...extra },
    encoding: "utf8", timeout: 5000,
  });
  return { ...result, commands: existsSync(trace) ? readFileSync(trace, "utf8") : "", bin, scratch };
}

describe("deployment guards", () => {
  it("keeps automatic deployment off until migration acceptance is explicitly recorded", () => {
    expect(workflow).toContain("&& vars.GIFTCARD_NODE24_MIGRATION_ACCEPTED == 'true'");
  });

  it.each(["dirty", "unknown"])("stops before pull/install/build/restart when checkout is %s", (state) => {
    const result = execute({ TEST_CHECKOUT: state });
    expect(result.status).toBe(1);
    expect(result.commands).toBe("");
  });

  it.each([
    { TEST_NODE_VERSION: "20.20.2" },
    { TEST_NODE_VERSION: "24.15.0" },
    { TEST_PNPM_VERSION: "10.0.0" },
  ])("rejects the wrong tool version before any mutation: %j", (versions) => {
    const result = execute(versions);
    expect(result.status).toBe(1);
    expect(result.commands).toBe("");
  });

  it("freezes install, isolates build data, and restarts only giftcard with the absolute interpreter", () => {
    const result = execute();
    expect(result.status, result.stderr).toBe(0);
    expect(result.commands).toContain("git pull\n");
    expect(result.commands).toContain("pnpm install --frozen-lockfile");
    const build = result.commands.split("\n").find((line) => line.startsWith("pnpm build"));
    expect(build).toContain(`db=${result.scratch}/`);
    expect(build).toContain(`uploads=${result.scratch}/`);
    expect(build).not.toContain("synthetic-live");
    expect(result.commands).toContain(`pm2 restart giftcard --interpreter ${result.bin}/node --update-env`);
    expect(result.commands).toContain(`rm -rf -- ${result.scratch}/giftcard-build.fixture`);
  });
});
