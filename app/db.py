import os
import sqlite3
from pathlib import Path
from contextlib import contextmanager
DB_PATH = Path(os.getenv("DATABASE_PATH", "data/skillforge.db"))
SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 email TEXT UNIQUE NOT NULL,
 password_hash TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS projects (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 name TEXT NOT NULL,
 start_url TEXT NOT NULL,
 scope TEXT NOT NULL DEFAULT 'host',
 max_pages INTEGER NOT NULL DEFAULT 100,
 status TEXT NOT NULL DEFAULT 'queued',
 pages INTEGER NOT NULL DEFAULT 0,
 words INTEGER NOT NULL DEFAULT 0,
 zip_path TEXT,
 error TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id)
);
"""
def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.executescript(SCHEMA)
        conn.commit()
@contextmanager
def db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()
