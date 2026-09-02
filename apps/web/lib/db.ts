import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { ensureWalletSchema } from "./schema-bootstrap";

const dbPath =
  process.env.DATABASE_PATH ||
  path.join(process.cwd(), "data", "gift-card-wallet.db");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
// `next build` imports this module from several workers at once; without a
// busy timeout the losers of a write-lock race fail outright with SQLITE_BUSY.
sqlite.pragma("busy_timeout = 5000");

// Must run before any query: the deploy workflow never runs `pnpm db:push`.
ensureWalletSchema(sqlite);

export const db = drizzle(sqlite, { schema });
export { sqlite };
