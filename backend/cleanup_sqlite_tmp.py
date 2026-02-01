import sqlite3
from pathlib import Path


def main() -> None:
    # DB real usada por el proyecto (ver backend/.env -> sqlite:///./sistemaconnect_dev_v2.db)
    # En Flask, suele resolverse dentro de /instance.
    candidates = [
        Path(__file__).resolve().parent / "instance" / "sistemaconnect_dev_v2.db",
        Path(__file__).resolve().parent / "sistemaconnect_dev_v2.db",
    ]

    db_path = next((p for p in candidates if p.exists()), candidates[0])
    print(f"using_db={db_path}")

    conn = sqlite3.connect(str(db_path))
    cur = conn.cursor()

    for t in ["_alembic_tmp_clients"]:
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (t,))
        row = cur.fetchone()
        print(f"{t}_exists={bool(row)}")
        if row:
            cur.execute(f"DROP TABLE {t}")
            conn.commit()
            print(f"{t}_dropped=true")

    conn.close()


if __name__ == "__main__":
    main()

