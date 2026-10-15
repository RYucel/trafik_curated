"""Bring historical_statistics in an existing database in line with db/schema.sql.

The injury and damage columns used to be NOT NULL DEFAULT 0, so a year whose source
publishes only fatality totals (2025, from the PGM year-end statement) could not be
stored without inventing zeros. SQLite cannot drop a NOT NULL constraint in place,
so the table is rebuilt once, then every record is reloaded from
data/processed/historical_1975_2025.json. Safe to run repeatedly.

Usage: python scripts/migrate_historical_statistics.py
"""
import json
import os
import sqlite3
import sys

sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.join(os.path.dirname(__file__), "..")
DB_PATH = os.path.join(ROOT, "db", "kktc_traffic.db")
HIST_JSON_PATH = os.path.join(ROOT, "data", "processed", "historical_1975_2025.json")

NULLABLE_COLUMNS = ('injury_accidents', 'injured', 'damage_accidents', 'injured_per_injury_accident')
COLUMNS = (
    'year', 'fatal_accidents', 'deaths', 'injury_accidents', 'injured', 'damage_accidents',
    'total_accidents', 'deaths_per_fatal_accident', 'injured_per_injury_accident', 'data_period'
)


def needs_rebuild(cursor):
    info = {row[1]: row[3] for row in cursor.execute("PRAGMA table_info(historical_statistics)")}
    return any(info.get(col) == 1 for col in NULLABLE_COLUMNS)


def rebuild_table(cursor):
    cursor.executescript("""
        ALTER TABLE historical_statistics RENAME TO historical_statistics_old;
        CREATE TABLE historical_statistics (
            year INTEGER PRIMARY KEY,
            fatal_accidents INTEGER NOT NULL DEFAULT 0,
            deaths INTEGER NOT NULL DEFAULT 0,
            injury_accidents INTEGER,
            injured INTEGER,
            damage_accidents INTEGER,
            total_accidents INTEGER NOT NULL DEFAULT 0,
            deaths_per_fatal_accident REAL NOT NULL DEFAULT 0.0,
            injured_per_injury_accident REAL,
            data_period TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO historical_statistics SELECT * FROM historical_statistics_old;
        DROP TABLE historical_statistics_old;
    """)


def reload_records(cursor):
    with open(HIST_JSON_PATH, 'r', encoding='utf-8') as f:
        records = json.load(f)
    placeholders = ', '.join('?' for _ in COLUMNS)
    # Upsert rather than INSERT OR REPLACE, which would reset created_at on every row.
    updates = ', '.join(f"{col} = excluded.{col}" for col in COLUMNS if col != 'year')
    for rec in records:
        cursor.execute(
            f"INSERT INTO historical_statistics ({', '.join(COLUMNS)}) VALUES ({placeholders}) "
            f"ON CONFLICT(year) DO UPDATE SET {updates}",
            tuple(rec[col] for col in COLUMNS)
        )
    return len(records)


def main():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    rebuilt = needs_rebuild(cursor)
    if rebuilt:
        rebuild_table(cursor)
    count = reload_records(cursor)
    conn.commit()
    conn.close()
    print(f"historical_statistics: {'rebuilt, ' if rebuilt else ''}{count} records reloaded.")


if __name__ == '__main__':
    main()
