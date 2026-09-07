import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(new URL("../../../.github/workflows/deploy.yml", import.meta.url), "utf8");
const sqliteRebuild = readFileSync(new URL("../../../scripts/rebuild-better-sqlite3-el8.sh", import.meta.url), "utf8");

describe("candidate workflow contract", () => {
  it("is manual and bound to one exact current main SHA", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toMatch(/^\s+push:/m);
    expect(workflow).toContain("GIFTCARD_NODE24_CANDIDATE_SHA");
    expect(workflow).toContain('test "$APPROVED_SHA" = "$GITHUB_SHA"');
    expect(workflow).toContain('test "$(git rev-parse origin/main)" = "$APPROVED_SHA"');
  });

  it("pins host identity, root, and runtime", () => {
    expect(workflow).toContain("DEPLOY_SSH_KNOWN_HOSTS");
    expect(workflow).toContain("/home/brenni6/apps/gift-card-wallet");
    expect(workflow).toContain("/home/brenni6/.local/node-v24/bin/node");
    expect(workflow).toContain("24.20.0");
    expect(workflow).toContain("9.15.0");
    expect(workflow.indexOf('cd "$WORK"')).toBeLessThan(workflow.indexOf('test "$(pnpm --version)" = 9.15.0'));
  });

  it("publishes only an isolated immutable candidate", () => {
    expect(workflow).toContain('CANDIDATE="$TARGET/releases/candidate-$APPROVED_SHA"');
    expect(workflow).toContain('DATABASE_PATH="$WORK/.candidate-validation/wallet.db"');
    expect(workflow).toContain('mv "$WORK" "$CANDIDATE"');
    expect(workflow).not.toMatch(/\bpm2\b/);
    expect(workflow).not.toContain("git pull");
    expect(workflow).not.toContain("git reset");
    expect(workflow).not.toContain(".env.production");
    expect(workflow).not.toContain("pnpm start");
  });

  it("requires audits, application checks, scratch WAL, and native proof", () => {
    for (const command of ["pnpm audit", "pnpm test", " exec tsc", " lint", " db:push", " db:wal", " build"]) {
      expect(workflow).toContain(command);
    }
    expect(workflow).toContain("integrity_check");
    expect(workflow).toContain(".source-sha");
    expect(workflow).toContain("bash scripts/rebuild-better-sqlite3-el8.sh");
    expect(sqliteRebuild).toContain("npm_config_build_from_source=true");
    expect(sqliteRebuild).toContain("rebuild better-sqlite3");
  });
});
