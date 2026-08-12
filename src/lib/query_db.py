import sys
import os
import json
import sqlite3

sys.stdout.reconfigure(encoding='utf-8')

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Missing parameters"}))
        return

    mode = sys.argv[1] # 'query' or 'execute'
    sql = sys.argv[2]
    params = json.loads(sys.argv[3]) if len(sys.argv) > 3 else []

    db_path = os.path.join(os.path.dirname(__file__), "..", "..", "db", "kktc_traffic.db")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    try:
        if mode == 'query':
            cursor.execute(sql, params)
            rows = cursor.fetchall()
            result = [dict(row) for row in rows]
            print(json.dumps(result, ensure_ascii=False))
        elif mode == 'execute':
            cursor.execute(sql, params)
            conn.commit()
            print(json.dumps({"success": True, "rows_affected": cursor.rowcount}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
    finally:
        conn.close()

if __name__ == "__main__":
    main()
