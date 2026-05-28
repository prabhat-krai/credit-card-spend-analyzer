import sqlite3
from pathlib import Path
from typing import List, Dict, Any, Optional

DB_PATH = Path(__file__).resolve().parent.parent.parent / "spends.db"

def get_db_connection():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    # Enable foreign keys
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create Cards Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
    );
    """)
    
    # Create Transactions Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        card_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        merchant TEXT NOT NULL,
        amount REAL NOT NULL,
        category TEXT NOT NULL,
        source_file TEXT,
        FOREIGN KEY(card_id) REFERENCES cards(id) ON DELETE CASCADE
    );
    """)
    
    # Create Processed Statements Table to track imported files
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS processed_statements (
        sha256 TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        processed_at TEXT DEFAULT CURRENT_TIMESTAMP,
        card_id INTEGER,
        FOREIGN KEY(card_id) REFERENCES cards(id) ON DELETE SET NULL
    );
    """)
    
    conn.commit()
    conn.close()

# Processed Statements APIs
def is_statement_processed(file_hash: str) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT 1 FROM processed_statements WHERE sha256 = ?;", (file_hash,))
    row = cursor.fetchone()
    conn.close()
    return row is not None

def mark_statement_processed(file_hash: str, filename: str, card_id: Optional[int]):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR IGNORE INTO processed_statements (sha256, filename, card_id)
        VALUES (?, ?, ?);
    """, (file_hash, filename, card_id))
    conn.commit()
    conn.close()

# Cards APIs
def get_cards() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name FROM cards ORDER BY name ASC;")
    rows = cursor.fetchall()
    cards = [dict(row) for row in rows]
    conn.close()
    return cards

def add_card(name: str) -> Dict[str, Any]:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO cards (name) VALUES (?);", (name,))
        conn.commit()
        new_id = cursor.lastrowid
        conn.close()
        return {"id": new_id, "name": name}
    except sqlite3.IntegrityError:
        conn.close()
        # Card already exists, fetch it
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, name FROM cards WHERE name = ?;", (name,))
        row = cursor.fetchone()
        conn.close()
        return dict(row)

# Transactions APIs
def get_transactions(card_id: str = "all", month: str = "all") -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = "SELECT id, card_id, date, merchant, amount, category, source_file FROM transactions WHERE 1=1"
    params = []
    
    if card_id != "all":
        query += " AND card_id = ?"
        params.append(int(card_id))
        
    if month != "all":
        # Date is in YYYY-MM-DD, filter by substr(date, 1, 7) = YYYY-MM
        query += " AND substr(date, 1, 7) = ?"
        params.append(month)
        
    query += " ORDER BY date DESC, id DESC;"
    
    cursor.execute(query, params)
    rows = cursor.fetchall()
    txs = [dict(row) for row in rows]
    conn.close()
    return txs

def add_transactions(card_id: int, transactions: List[Dict[str, Any]]):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    for tx in transactions:
        cursor.execute("""
            INSERT INTO transactions (card_id, date, merchant, amount, category, source_file)
            VALUES (?, ?, ?, ?, ?, ?);
        """, (
            card_id,
            tx.get("date"),
            tx.get("merchant"),
            float(tx.get("amount", 0)),
            tx.get("category", "other"),
            tx.get("source_file")
        ))
        
    conn.commit()
    conn.close()

def update_transaction(tx_id: int, merchant: Optional[str] = None, category: Optional[str] = None) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    updates = []
    params = []
    
    if merchant is not None:
        updates.append("merchant = ?")
        params.append(merchant)
        
    if category is not None:
        updates.append("category = ?")
        params.append(category)
        
    if not updates:
        conn.close()
        return False
        
    query = f"UPDATE transactions SET {', '.join(updates)} WHERE id = ?;"
    params.append(tx_id)
    
    cursor.execute(query, params)
    conn.commit()
    rows_affected = cursor.rowcount
    conn.close()
    return rows_affected > 0

def delete_transaction(tx_id: int) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM transactions WHERE id = ?;", (tx_id,))
    conn.commit()
    rows_affected = cursor.rowcount
    conn.close()
    return rows_affected > 0

def get_distinct_months() -> List[str]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT substr(date, 1, 7) as month FROM transactions ORDER BY month DESC;")
    rows = cursor.fetchall()
    months = [row["month"] for row in rows if row["month"]]
    conn.close()
    return months

# Auto-initialize database schema on load
init_db()
