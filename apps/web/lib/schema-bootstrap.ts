import type Database from "better-sqlite3";

const TABLE = "gift_card_transaction";

/**
 * Physical cards buy gas; digital cards buy merchandise. Sign is irrelevant:
 * a negative amount is an adjustment to a charge in the same category, so it
 * classifies exactly like the charge it corrects.
 *
 * Mirrors `categoryForCardType` in @gift-card-wallet/domain. Expressed as SQL
 * here so the backfill is a single statement rather than a row-by-row loop.
 */
const CLASSIFY_BY_CARD_TYPE = `
  UPDATE ${TABLE}
  SET category = (
    SELECT CASE WHEN gc.type = 'Digital' THEN 'merchandise' ELSE 'gas' END
    FROM gift_card gc WHERE gc.id = ${TABLE}."cardId"
  )
  WHERE EXISTS (SELECT 1 FROM gift_card gc WHERE gc.id = ${TABLE}."cardId")
`;

/**
 * Converge the live SQLite file on the current Drizzle schema.
 *
 * The deploy workflow pulls, builds and restarts under pm2 — it never runs
 * `pnpm db:push`. A column that existed only in the schema file would be
 * missing from the database and every transaction query would throw. Running
 * the DDL at handle-construction time gives the schema-before-first-query
 * ordering guarantee that a separate deploy step cannot.
 */
export function ensureWalletSchema(sqlite: Database.Database): void {
  const columns = sqlite.prepare(`PRAGMA table_info(${TABLE})`).all() as {
    name: string;
  }[];

  // An empty result means the table does not exist yet — a fresh install
  // before `pnpm db:push`. There is nothing to converge, and Drizzle will
  // create the column from the schema definition. Bail out rather than
  // ALTERing a table that isn't there.
  if (columns.length === 0) return;

  if (!columns.some((c) => c.name === "category")) {
    // SQLite demands a non-null default when adding a NOT NULL column to a
    // table that already has rows. The placeholder is overwritten before this
    // transaction commits, so no reader ever observes it.
    sqlite.transaction(() => {
      sqlite.exec(
        `ALTER TABLE ${TABLE} ADD COLUMN category TEXT NOT NULL DEFAULT 'merchandise'`,
      );
      sqlite.exec(CLASSIFY_BY_CARD_TYPE);
    })();
    return;
  }

  // Per-boot repair, so "every row holds a legal value" is an invariant the
  // system enforces rather than one it assumes. Rows already holding gas or
  // merchandise are untouched, so a manual re-classification is never reverted.
  //
  // The count is checked first so the steady-state path issues no write at all.
  // `next build` imports this module from several workers at once, and an
  // unconditional UPDATE would have them all contend for the write lock and
  // fail with SQLITE_BUSY even though there is nothing to repair.
  const broken = sqlite
    .prepare(
      `SELECT COUNT(*) AS n FROM ${TABLE} WHERE category NOT IN ('gas','merchandise')`,
    )
    .get() as { n: number };
  if (broken.n === 0) return;

  sqlite.exec(`${CLASSIFY_BY_CARD_TYPE} AND category NOT IN ('gas','merchandise')`);
}
