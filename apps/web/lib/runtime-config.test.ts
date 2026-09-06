import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const root = new URL("../../../", import.meta.url);
const read = (file: string) => readFileSync(new URL(file, root), "utf8");

describe("Node 24 migration contract", () => {
  it("pins the developer and CI runtime to the tested patch", () => {
    expect(read(".nvmrc").trim()).toBe("24.20.0");
    expect(JSON.parse(read("package.json")).engines.node).toBe("24.20.0");
    expect(read(".github/workflows/ci.yml")).toContain('node-version: "24.20.0"');
  });

  it("uses an absolute app interpreter and storage paths independent of daemon PATH and standalone cwd", () => {
    const context = { module: { exports: {} as { apps: Array<{
      name: string; interpreter: string; cwd: string; script: string;
      exec_mode: string; instances: number; node_args: string; env: { DATABASE_PATH: string; UPLOADS_PATH: string };
    }> } } };
    runInNewContext(read("apps/web/scripts/ecosystem.config.js.template"), context);
    const [app] = context.module.exports.apps;
    expect(app.name).toBe("giftcard");
    expect(app.interpreter).toBe("/home/brenni6/.local/node-v24/bin/node");
    expect(app.exec_mode).toBe("fork");
    expect(app.instances).toBe(1);
    expect(app.node_args).toBe("--env-file=.env");
    expect(app.cwd).toMatch(/\/apps\/web$/);
    expect(app.script).toBe(".next/standalone/apps/web/server.js");
    expect(path.posix.isAbsolute(app.env.DATABASE_PATH)).toBe(true);
    expect(path.posix.isAbsolute(app.env.UPLOADS_PATH)).toBe(true);
  });
});
