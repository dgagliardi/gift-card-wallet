#!/usr/bin/env python3
"""
Import gift cards and transactions from the Google Sheets xlsx export into SQLite.

Usage:
    python3 scripts/import-from-xlsx.py path/to/Gift\ Card\ Tracker.xlsx

The script auto-detects the only user in the DB. Run AFTER:
  1. pnpm db:push
  2. Creating your account at /setup
"""

import sys
import os
import sqlite3
from pathlib import Path

try:
    import pandas as pd
except ImportError:
    print("ERROR: pandas not installed. Run: pip3 install pandas openpyxl")
    sys.exit(1)

# --- Config -------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).parent
DEFAULT_DB = SCRIPT_DIR.parent / "data" / "gift-card-wallet.db"
DB_PATH = os.environ.get("DATABASE_PATH", str(DEFAULT_DB))

if len(sys.argv) < 2:
    print(__doc__)
    sys.exit(1)

XLSX_PATH = sys.argv[1]

# --- Helpers ------------------------------------------------------------------

def to_ms(ts):
    """Pandas Timestamp → integer milliseconds."""
    if pd.isna(ts):
        return None
    return int(pd.Timestamp(ts).timestamp() * 1000)

def clean_card_number(val):
    """Convert float card number (e.g. 6.346204e+15) to string."""
    if pd.isna(val):
        return ""
    return str(int(val))

def clean_balance(val):
    """Round near-zero float artifacts to 0."""
    if pd.isna(val):
        return 0.0
    rounded = round(float(val), 2)
    return 0.0 if abs(rounded) < 0.001 else rounded

def clean_pin(val):
    if pd.isna(val):
        return ""
    return str(int(val)) if isinstance(val, float) else str(val)

# --- Load xlsx ----------------------------------------------------------------

print(f"Reading {XLSX_PATH}...")
xl = pd.read_excel(XLSX_PATH, sheet_name=None)

missing_sheets = {"Cards", "Transactions"} - set(xl.keys())
if missing_sheets:
    print(f"ERROR: xlsx is missing sheets: {missing_sheets}")
    sys.exit(1)

cards_df = xl["Cards"]
txns_df = xl["Transactions"]

REQUIRED_CARD_COLS = {"Card ID", "Brand", "Type", "Date Added", "Initial Balance"}
REQUIRED_TXN_COLS = {"Date", "Card Id", "Amount Deducted"}
for label, df, required in [("Cards", cards_df, REQUIRED_CARD_COLS), ("Transactions", txns_df, REQUIRED_TXN_COLS)]:
    missing_cols = required - set(df.columns)
    if missing_cols:
        print(f"ERROR: '{label}' sheet is missing columns: {missing_cols}")
        sys.exit(1)

print(f"  Found {len(cards_df)} cards, {len(txns_df)} transactions")

# --- Connect to DB ------------------------------------------------------------

print(f"Connecting to {DB_PATH}...")
con = sqlite3.connect(DB_PATH)
cur = con.cursor()

# Verify schema exists
tables = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
required = {"user", "gift_card", "gift_card_transaction"}
missing = required - tables
if missing:
    print(f"ERROR: Tables missing: {missing}")
    print("Run 'pnpm db:push' first, then create your account at /setup.")
    sys.exit(1)

# --- Resolve user -------------------------------------------------------------

users = cur.execute("SELECT id, email FROM user").fetchall()
if not users:
    print("ERROR: No users found in DB.")
    print("Create your account at /setup first, then re-run this script.")
    sys.exit(1)
if len(users) > 1:
    print("Multiple users found:")
    for i, (uid, email) in enumerate(users):
        print(f"  [{i}] {email} ({uid})")
    choice = int(input("Enter number: "))
    user_id = users[choice][0]
else:
    user_id = users[0][0]
    print(f"Using user: {users[0][1]} ({user_id})")

# --- Check for existing data --------------------------------------------------

existing_cards = cur.execute(
    "SELECT COUNT(*) FROM gift_card WHERE userId = ?", (user_id,)
).fetchone()[0]
if existing_cards > 0:
    print(f"\nWARNING: {existing_cards} cards already exist for this user.")
    answer = input("Continue and skip duplicates? [y/N] ").strip().lower()
    if answer != "y":
        print("Aborted.")
        sys.exit(0)

existing_ids = {r[0] for r in cur.execute("SELECT id FROM gift_card WHERE userId = ?", (user_id,)).fetchall()}

# --- Import cards -------------------------------------------------------------

now_ms = int(pd.Timestamp.now().timestamp() * 1000)
cards_inserted = 0

for _, row in cards_df.iterrows():
    card_id = str(row["Card ID"])
    if card_id in existing_ids:
        print(f"  Skipping existing card: {card_id}")
        continue

    archived = 1 if not pd.isna(row.get("Archived")) and row["Archived"] == 1.0 else 0
    date_added = to_ms(row["Date Added"]) or now_ms

    cur.execute(
        """
        INSERT INTO gift_card
          (id, userId, brand, type, dateAdded, initialBalance,
           imagePath, cardNumber, pin, balanceUrl, archived, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            card_id,
            user_id,
            str(row["Brand"]),
            str(row["Type"]),
            date_added,
            float(row["Initial Balance"]),
            "",  # imagePath — Drive URLs are not transferable; re-upload manually
            clean_card_number(row.get("Card Number")),
            clean_pin(row.get("PIN")),
            str(row["Check Balance URL"]) if not pd.isna(row.get("Check Balance URL")) else "",
            archived,
            now_ms,
            now_ms,
        ),
    )
    cards_inserted += 1
    print(f"  Inserted card: {card_id} ({row['Brand']} {row['Type']})")

# --- Import transactions ------------------------------------------------------

existing_txn_ids = {r[0] for r in cur.execute("SELECT id FROM gift_card_transaction WHERE userId = ?", (user_id,)).fetchall()}
# Stable ID: row index disambiguates same-card same-day same-amount transactions
txns_inserted = 0

for row_idx, row in txns_df.iterrows():
    card_id = str(row["Card Id"])
    date_ms = to_ms(row["Date"]) or now_ms
    amount = clean_balance(row["Amount Deducted"])

    synthetic_id = f"TXN_{card_id}_{date_ms}_{int(amount * 100)}_{row_idx}"
    if synthetic_id in existing_txn_ids:
        print(f"  Skipping existing txn: {synthetic_id}")
        continue

    note = str(row["Note"]) if not pd.isna(row.get("Note")) else ""

    cur.execute(
        """
        INSERT INTO gift_card_transaction
          (id, userId, cardId, date, amount, note, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (synthetic_id, user_id, card_id, date_ms, amount, note, now_ms, now_ms),
    )
    txns_inserted += 1
    print(f"  Inserted txn: {synthetic_id} (${amount})")

con.commit()
con.close()

print(f"\nDone. Inserted {cards_inserted} cards and {txns_inserted} transactions.")
print("Note: Image URLs from Google Drive are not transferred — re-upload card photos manually.")
