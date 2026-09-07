import path from "node:path";
import Database from "better-sqlite3";

const databasePath = process.env.DATABASE_PATH;
if (!databasePath || !path.isAbsolute(databasePath)) {
  throw new Error("DATABASE_PATH must be an absolute path");
}

const sqlite = new Database(databasePath);
try {
  sqlite.pragma("busy_timeout = 10000");
  const mode = sqlite.pragma("journal_mode = WAL", { simple: true });
  if (mode !== "wal") throw new Error(`Expected WAL mode, received ${mode}`);
} finally {
  sqlite.close();
}
