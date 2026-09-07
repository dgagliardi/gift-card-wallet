import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import withPWAInit from "@ducanh2912/next-pwa";

const appRoot = dirname(fileURLToPath(import.meta.url));
const appVersion = JSON.parse(
  readFileSync(join(appRoot, "package.json"), "utf8"),
).version;

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  cacheOnFrontEndNav: true,
  workboxOptions: { disableDevLogs: true },
});

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default withPWA({
  basePath: basePath || undefined,
  output: "standalone",
  transpilePackages: ["@gift-card-wallet/domain"],
  serverExternalPackages: ["better-sqlite3"],
  env: { NEXT_PUBLIC_APP_VERSION: appVersion },
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
});
