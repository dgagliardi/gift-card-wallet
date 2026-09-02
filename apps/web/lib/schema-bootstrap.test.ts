import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureWalletSchema } from "./schema-bootstrap";

let sqlite: Database.Database;

function seed() {
  sqlite.exec(`
    CREATE TABLE gift_card (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL
    );
    CREATE TABLE gift_card_transaction (
      id TEXT PRIMARY KEY,
      cardId TEXT NOT NULL,
      amount REAL NOT NULL
    );
    INSERT INTO gift_card (id, type) VALUES ('p', 'Physical'), ('d', 'Digital');
    INSERT INTO gift_card_transaction (id, cardId, amount) VALUES
      ('t1', 'p', 50),
      ('t2', 'p', -10),
      ('t3', 'd', 25);
  `);
}

function categories() {
  return sqlite
    .prepare("SELECT id, category FROM gift_card_transaction ORDER BY id")
    .all() as { id: string; category: string }[];
}

beforeEach(() => {
  sqlite = new Database(":memory:");
  seed();
});

afterEach(() => sqlite.close());

describe("ensureWalletSchema", () => {
  it("adds the category column and classifies by card type", () => {
    ensureWalletSchema(sqlite);
    expect(categories()).toEqual([
      { id: "t1", category: "gas" },
      { id: "t2", category: "gas" },
      { id: "t3", category: "merchandise" },
    ]);
  });

  it("classifies a negative amount like any other charge on the card", () => {
    ensureWalletSchema(sqlite);
    expect(categories().find((r) => r.id === "t2")?.category).toBe("gas");
  });

  it("leaves no row outside the two legal values", () => {
    ensureWalletSchema(sqlite);
    const bad = sqlite
      .prepare(
        "SELECT COUNT(*) AS n FROM gift_card_transaction WHERE category NOT IN ('gas','merchandise')",
      )
      .get() as { n: number };
    expect(bad.n).toBe(0);
  });

  it("is idempotent and does not revert a manual re-classification", () => {
    ensureWalletSchema(sqlite);
    sqlite
      .prepare("UPDATE gift_card_transaction SET category = 'merchandise' WHERE id = 't1'")
      .run();
    ensureWalletSchema(sqlite);
    expect(categories()).toEqual([
      { id: "t1", category: "merchandise" },
      { id: "t2", category: "gas" },
      { id: "t3", category: "merchandise" },
    ]);
  });

  it("repairs a row holding an illegal value", () => {
    ensureWalletSchema(sqlite);
    sqlite.prepare("UPDATE gift_card_transaction SET category = '' WHERE id = 't3'").run();
    ensureWalletSchema(sqlite);
    expect(categories().find((r) => r.id === "t3")?.category).toBe("merchandise");
  });

  it("is a no-op on a fresh database that has no tables yet", () => {
    // Regression: PRAGMA table_info returns empty both for a missing column
    // and a missing table, so this used to ALTER a table that did not exist
    // and crash the app at import before `pnpm db:push` had ever run.
    const fresh = new Database(":memory:");
    expect(() => ensureWalletSchema(fresh)).not.toThrow();
    fresh.close();
  });

  it("performs no write once every row is already classified", () => {
    // Regression: `next build` imports lib/db.ts from several workers at once.
    // An unconditional repair UPDATE made each import contend for the write
    // lock and fail with SQLITE_BUSY. query_only makes any write throw, so
    // this test fails if the steady-state path regains one.
    ensureWalletSchema(sqlite);
    sqlite.pragma("query_only = ON");
    expect(() => ensureWalletSchema(sqlite)).not.toThrow();
    sqlite.pragma("query_only = OFF");
  });

  it("runs clean on a database that already has the column and no rows", () => {
    sqlite.exec("DELETE FROM gift_card_transaction");
    ensureWalletSchema(sqlite);
    ensureWalletSchema(sqlite);
    expect(categories()).toEqual([]);
  });
});
