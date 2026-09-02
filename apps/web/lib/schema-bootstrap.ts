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
  sqlite.exec(`${CLASSIFY_BY_CARD_TYPE} AND category NOT IN ('gas','merchandise')`);
}
