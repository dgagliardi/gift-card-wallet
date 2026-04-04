import path from "node:path";
import { defineConfig } from "drizzle-kit";

const dbPath =
  process.env.DATABASE_PATH ||
  path.join(process.cwd(), "data", "gift-card-wallet.db");

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: { url: dbPath },
});
