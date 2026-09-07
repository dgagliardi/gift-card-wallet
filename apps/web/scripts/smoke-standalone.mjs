// Local/CI only. Builds must also use disposable, absolute data paths.
// Retains its temporary directory for inspection; never reads a real env file.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

assert.equal(process.version, "v24.20.0", "Use exactly Node 24.20.0");
const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
assert.deepEqual(readdirSync(source).filter((name) => name.startsWith(".env") && name !== ".env.example"), [],
  "Run smoke only in a disposable checkout without operational env files");
const scratch = mkdtempSync(path.join(tmpdir(), "giftcard-node24-smoke-"));
console.log(`Retained synthetic artifacts: ${scratch}`);
const cwd = path.join(scratch, "apps/web");
const bundle = path.join(cwd, ".next/standalone");
const app = path.join(bundle, "apps/web");
mkdirSync(cwd, { recursive: true });
cpSync(path.join(source, ".next/standalone"), bundle, { recursive: true, dereference: true });
cpSync(path.join(source, "public"), path.join(app, "public"), { recursive: true });
cpSync(path.join(source, ".next/static"), path.join(app, ".next/static"), { recursive: true });

// Load native modules from the copied artifact, outside the workspace's modules.
const require = createRequire(path.join(app, "server.js"));
const Database = require("better-sqlite3");
const dbPath = path.join(scratch, "wallet.db");
// Bootstrap the real schema in synthetic storage, never a live database.
const sourceRequire = createRequire(path.join(source, "package.json"));
const drizzleBin = path.join(path.dirname(sourceRequire.resolve("drizzle-kit")), "bin.cjs");
const schema = spawnSync(process.execPath, [drizzleBin, "push", "--force"], {
  cwd: source, env: { PATH: process.env.PATH, DATABASE_PATH: dbPath }, encoding: "utf8", timeout: 30000,
});
assert.equal(schema.status, 0, `Synthetic schema setup failed: ${schema.stderr}`);
const db = new Database(dbPath);
assert.equal(db.pragma("journal_mode = WAL", { simple: true }), "wal");
db.exec("CREATE TABLE native_probe (id TEXT PRIMARY KEY); INSERT INTO native_probe VALUES ('synthetic-row')");
await db.backup(path.join(scratch, "wallet-backup.db"));
db.close();
for (const filename of [dbPath, path.join(scratch, "wallet-backup.db")]) {
  const reopened = new Database(filename, { readonly: true, fileMustExist: true });
  assert.equal(reopened.pragma("integrity_check", { simple: true }), "ok");
  assert.equal(reopened.prepare("SELECT COUNT(*) AS n FROM native_probe").get().n, 1);
  reopened.close();
}
const nextRequire = createRequire(require.resolve("next/package.json"));
const sharp = nextRequire("sharp");
const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: "white" } }).png().toBuffer();
assert.equal((await sharp(png).metadata()).format, "png");

const reservation = net.createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const port = reservation.address().port;
await new Promise((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()));
const origin = `http://127.0.0.1:${port}`;
const request = (route, options = {}) => fetch(new URL(route, origin), {
  ...options, signal: AbortSignal.timeout(5000),
});
const uploads = path.join(scratch, "uploads");
mkdirSync(uploads);
// Exercise Node's env-file loading before Next changes cwd, just as PM2 does.
writeFileSync(path.join(cwd, "smoke.env"), [
  `DATABASE_PATH=${dbPath}`,
  `UPLOADS_PATH=${uploads}`,
  `BETTER_AUTH_SECRET=${randomBytes(32).toString("hex")}`,
  `BETTER_AUTH_URL=${origin}`,
  "ENABLE_EMAIL_PASSWORD=true",
].join("\n"), { mode: 0o600 });
const child = spawn(process.execPath, ["--env-file=smoke.env", path.join(app, "server.js")], {
  cwd,
  // Do not inherit credentials, NODE_OPTIONS, or production storage paths.
  env: { PATH: process.env.PATH, NODE_ENV: "production", HOSTNAME: "127.0.0.1", PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});
const exited = once(child, "exit");
let output = "";
child.stdout.on("data", (data) => { output = (output + data).slice(-16000); });
child.stderr.on("data", (data) => { output = (output + data).slice(-16000); });
try {
  let ready = false;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    assert.equal(child.exitCode, null, `Standalone exited: ${output}`);
    try {
      const response = await fetch(`${origin}/api/auth/get-session`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) { ready = true; break; }
    } catch { /* Bounded startup polling on this newly spawned server. */ }
    await delay(100);
  }
  assert.ok(ready, `Standalone did not become ready: ${output}`);
  const signup = await request("/api/auth/sign-up/email", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ name: "Synthetic User", email: "smoke@example.invalid", password: randomBytes(24).toString("hex") }),
  });
  assert.equal(signup.status, 200, `Synthetic signup failed: ${output}`);
  const { user } = await signup.json();
  const cookie = signup.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  assert.ok(cookie, "Synthetic signup must establish a session");
  const userUploads = path.join(uploads, user.id);
  mkdirSync(userUploads);
  writeFileSync(path.join(userUploads, "card.png"), png);
  const uploaded = await request(`/api/uploads/${user.id}/card.png`, { headers: { Cookie: cookie } });
  assert.equal(uploaded.status, 200);
  assert.deepEqual(Buffer.from(await uploaded.arrayBuffer()), png, "Read the existing image from the absolute upload path");
  assert.equal((await request("/", { headers: { Cookie: cookie } })).status, 200);
  const login = await request("/login", { redirect: "manual" });
  assert.equal(login.status, 200, `Existing synthetic wallet must not redirect to setup: ${output}`);
  const html = await login.text();
  const asset = html.match(/src="([^"]*\/_next\/static\/[^"]+\.js)"/)?.[1];
  assert.ok(asset, "Login must reference a packaged JS asset");
  assert.equal((await request(asset)).status, 200);
  assert.equal((await request("/sw.js")).status, 200);
  assert.equal((await request("/api/uploads/synthetic-user/card.png")).status, 401);
  assert.equal(existsSync(path.join(app, "data/gift-card-wallet.db")), false, "No fallback wallet under standalone cwd");
  assert.equal(existsSync(path.join(app, "data/uploads")), false, "No fallback uploads under standalone cwd");
  console.log(JSON.stringify({ node: process.version, abi: process.versions.modules, platform: process.platform,
    arch: process.arch, sqlite: "WAL/write/reopen/backup/integrity ok", sharp: "PNG encode/decode ok",
    standalone: "signup/wallet/login/static/PWA/authenticated image/upload protection ok" }));
} finally {
  child.kill("SIGTERM");
  const force = setTimeout(() => child.kill("SIGKILL"), 5000);
  await exited;
  clearTimeout(force);
}
