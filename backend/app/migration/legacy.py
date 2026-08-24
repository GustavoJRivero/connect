"""Migración MikroWisp (base legacy) -> Connect (sistemaconnect)."""
from __future__ import annotations

import json
import os
import re
import subprocess
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any
from urllib.parse import unquote, urlparse

import pymysql

LEGACY_DB = "legacy"
SERIAL_FIELD_KEY = "1745272069"
MIGRATION_DIR = os.environ.get("MIGRATION_DIR", "/app/data/migration")
MAX_DUMP_BYTES = int(os.environ.get("MIGRATION_MAX_BYTES", str(600 * 1024 * 1024)))

WIPE_TABLES = [
    "payment_allocations",
    "payments",
    "invoices",
    "complaints",
    "jobs",
    "billing_runs",
    "connections",
    "clients",
    "plans",
    "mikrotik_servers",
]


class MigrationError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def parse_mysql_url(database_url: str) -> dict[str, Any]:
    raw = (database_url or "").strip()
    if not raw:
        raise MigrationError("database_url_missing", "DATABASE_URL no está configurada.")
    normalized = raw.replace("mysql+pymysql://", "mysql://", 1)
    parsed = urlparse(normalized)
    target_db = (parsed.path or "/sistemaconnect").lstrip("/") or "sistemaconnect"
    return {
        "host": parsed.hostname or "db",
        "port": int(parsed.port or 3306),
        "user": unquote(parsed.username or "root"),
        "password": unquote(parsed.password or ""),
        "target_db": target_db,
    }


def connect(db_params: dict[str, Any], database: str | None = None):
    return pymysql.connect(
        host=db_params["host"],
        port=db_params["port"],
        user=db_params["user"],
        password=db_params["password"],
        database=database,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
    )


def norm_doc(cedula):
    raw = (cedula or "").strip()
    if not raw:
        return (None, None, None, "PERSON")
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 11:
        kind = "COMPANY" if digits[:2] in ("30", "33", "34") else "PERSON"
        return (digits, None, digits, kind)
    if 7 <= len(digits) <= 8 and digits == raw.replace(" ", ""):
        return (digits, digits, None, "PERSON")
    if 7 <= len(digits) <= 8:
        return (digits, digits, None, "PERSON")
    return (raw, raw[:32], None, "PERSON")


def pon_sn_from_personalizados(blob):
    raw = (blob or "").strip()
    if not raw or raw in ("[]", "{}"):
        return None
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        return None
    if not isinstance(data, dict):
        return None
    val = data.get(SERIAL_FIELD_KEY)
    if val is None:
        return None
    val = str(val).strip()
    return val[:64] if val else None


def vel_to_mbps(velocidad):
    raw = (velocidad or "").strip()
    if "/" not in raw:
        return (0, 0)
    parts = raw.split("/")

    def one(token):
        token = token.strip().upper()
        m = re.match(r"^(\d+)\s*([KM]?)", token)
        if not m:
            return 0
        n = int(m.group(1))
        unit = m.group(2)
        if unit == "K":
            return n // 1000
        if unit == "M":
            return n
        return n // 1000

    return (one(parts[0]), one(parts[1]))


def status_map(estado):
    e = (estado or "").strip().upper()
    if e == "RETIRADO":
        return ("RETIRED", "DISABLED", False)
    if e == "SUSPENDIDO":
        return ("ACTIVE", "CUT", True)
    return ("ACTIVE", "ACTIVE", True)


def load_legacy(cur, db_params):
    legacy = LEGACY_DB
    cur.execute(f"SELECT * FROM `{legacy}`.perfiles")
    perfiles = {r["id"]: r for r in cur.fetchall()}
    cur.execute(f"SELECT * FROM `{legacy}`.server")
    servers = cur.fetchall()
    cur.execute(
        f"SELECT id, nombre, estado, correo, telefono, movil, cedula, "
        f"direccion_principal FROM `{legacy}`.usuarios"
    )
    usuarios = cur.fetchall()
    cur.execute(
        f"SELECT id, idcliente, idperfil, nodo, ip, pppuser, ppppass, "
        f"direccion, coordenadas, personalizados, "
        f"CAST(instalado AS CHAR) AS instalado FROM `{legacy}`.tblservicios"
    )
    servicios = cur.fetchall()
    return perfiles, servers, usuarios, servicios


def build_plans(perfiles):
    rows = []
    for pid, p in sorted(perfiles.items()):
        profile = (p["profile"] or "").strip()
        if not profile:
            continue
        down, up = vel_to_mbps(p["velocidad"])
        rows.append(
            {
                "id": pid,
                "name": profile,
                "profile": profile,
                "download_mbps": down,
                "upload_mbps": up,
                "price": p["costo"] or 0,
                "iva_percent": p["impuesto"] or 0,
                "is_active": 0 if int(p.get("is_disabled") or 0) == 1 else 1,
            }
        )
    return rows


def build_servers(servers):
    rows = []
    for s in servers:
        try:
            port = int(str(s["port_api"]).strip() or 8728)
        except ValueError:
            port = 8728
        api_ssl = str(s.get("api_ssl") or "").strip().lower()
        use_ssl = 1 if api_ssl in ("1", "on", "true", "yes", "si") else 0
        rows.append(
            {
                "id": s["id"],
                "name": (s["nodo"] or f"SERVER-{s['id']}").strip(),
                "host": (s["ip"] or "").strip(),
                "port": port,
                "username": "CONFIGURAR",
                "password": "CONFIGURAR",
                "use_ssl": use_ssl,
                "local_address": None,
                "ip_pool_cidrs": None,
            }
        )
    return rows


def build_clients(usuarios):
    groups = defaultdict(list)
    singles = []
    for u in usuarios:
        gkey, dni, cuit, kind = norm_doc(u["cedula"])
        u["_dni"] = dni
        u["_cuit"] = cuit
        u["_kind"] = kind
        if gkey is None:
            singles.append(u)
        else:
            groups[gkey].append(u)

    clients = []
    client_map = {}

    def first_nonempty(items, field):
        for it in items:
            v = (it.get(field) or "").strip()
            if v:
                return v
        return None

    def make_client(members):
        members = sorted(members, key=lambda x: int(x["id"]))
        rep = members[0]
        client_id = int(rep["id"])
        estados = [(m["estado"] or "").strip().upper() for m in members]
        if all(e == "RETIRADO" for e in estados):
            client_status, is_active = "RETIRED", False
        else:
            client_status, is_active = "ACTIVE", True
        full_name = first_nonempty(members, "nombre") or f"Cliente {client_id}"
        phone = first_nonempty(members, "movil") or first_nonempty(members, "telefono")
        email = first_nonempty(members, "correo")
        address = first_nonempty(members, "direccion_principal")
        clients.append(
            {
                "id": client_id,
                "kind": rep["_kind"],
                "full_name": full_name.strip()[:200],
                "dni": rep["_dni"],
                "cuit": rep["_cuit"],
                "phone": (phone[:50] if phone else None),
                "email": (email[:200] if email else None),
                "address": (address[:255] if address else None),
                "is_active": 1 if is_active else 0,
                "status": client_status,
            }
        )
        for m in members:
            client_map[int(m["id"])] = client_id

    for members in groups.values():
        make_client(members)
    for u in singles:
        make_client([u])

    return clients, client_map


def build_connections(servicios, usuarios_by_id, perfiles, client_map):
    rows = []
    skipped = []
    for s in servicios:
        owner_id = int(s["idcliente"])
        client_id = client_map.get(owner_id)
        if client_id is None:
            skipped.append((s["id"], "sin_cliente", owner_id))
            continue
        perfil = perfiles.get(s["idperfil"])
        if not perfil:
            skipped.append((s["id"], "sin_perfil", s["idperfil"]))
            continue
        profile = (perfil["profile"] or "").strip()
        owner = usuarios_by_id.get(owner_id)
        _, conn_status, _ = status_map(owner["estado"] if owner else "ACTIVO")

        service_address = (s.get("direccion") or "").strip()
        if not service_address and owner:
            service_address = (owner.get("direccion_principal") or "").strip()
        location = (s.get("coordenadas") or "").strip() or None
        ip = (s.get("ip") or "").strip() or None
        ppp_user = (s.get("pppuser") or "").strip() or None
        ppp_pass = (s.get("ppppass") or "").strip() or None
        created_at = (s.get("instalado") or "").strip()
        if not created_at or created_at == "0000-00-00":
            created_at = None

        rows.append(
            {
                "id": int(s["id"]),
                "client_id": client_id,
                "server_id": int(s["nodo"]) if s.get("nodo") else None,
                "service_address": (service_address[:255] or None),
                "location": (location[:255] if location else None),
                "plan_profile": profile[:64],
                "plan_id": int(s["idperfil"]),
                "mikrotik_profile": profile[:64],
                "status": conn_status,
                "ip": ip[:64] if ip else None,
                "ip_is_fixed": 1,
                "pppoe_username": ppp_user[:128] if ppp_user else None,
                "pppoe_password": ppp_pass[:128] if ppp_pass else None,
                "billing_day": 1,
                "prorate_first_month": 0,
                "pon_sn": pon_sn_from_personalizados(s.get("personalizados")),
                "created_at": created_at,
            }
        )
    return rows, skipped


def summarize_migration(perfiles, servers, usuarios, servicios, plans, server_rows, clients, conns, skipped):
    merged = len(usuarios) - len(clients)
    st = defaultdict(int)
    for c in clients:
        st[c["status"]] += 1
    cst = defaultdict(int)
    for c in conns:
        cst[c["status"]] += 1
    with_pon = sum(1 for c in conns if c["pon_sn"])
    return {
        "plans": len(plans),
        "servers": len(server_rows),
        "usuarios": len(usuarios),
        "clients": len(clients),
        "merged_clients": merged,
        "connections": len(conns),
        "skipped_connections": len(skipped),
        "skipped_samples": [
            {"service_id": sid, "reason": reason, "ref": ref}
            for sid, reason, ref in skipped[:10]
        ],
        "client_status": dict(st),
        "connection_status": dict(cst),
        "connections_with_pon_sn": with_pon,
    }


def _legacy_db_exists(cur) -> bool:
    cur.execute("SHOW DATABASES LIKE %s", (LEGACY_DB,))
    return cur.fetchone() is not None


def _table_count(cur, database: str, table: str) -> int | None:
    try:
        cur.execute(f"SELECT COUNT(*) AS c FROM `{database}`.`{table}`")
        row = cur.fetchone()
        return int(row["c"]) if row else 0
    except Exception:
        return None


def get_migration_status(database_url: str) -> dict[str, Any]:
    db_params = parse_mysql_url(database_url)
    conn = connect(db_params)
    cur = conn.cursor()
    try:
        legacy_ready = _legacy_db_exists(cur)
        legacy_usuarios = _table_count(cur, LEGACY_DB, "usuarios") if legacy_ready else None
        legacy_servicios = _table_count(cur, LEGACY_DB, "tblservicios") if legacy_ready else None
        target = db_params["target_db"]
        target_clients = _table_count(cur, target, "clients")
        target_connections = _table_count(cur, target, "connections")
        return {
            "legacy_ready": legacy_ready,
            "legacy_usuarios": legacy_usuarios,
            "legacy_servicios": legacy_servicios,
            "target_clients": target_clients,
            "target_connections": target_connections,
        }
    finally:
        conn.close()


def recreate_legacy_db(db_params: dict[str, Any]) -> None:
    conn = connect(db_params, database=None)
    cur = conn.cursor()
    try:
        cur.execute(f"DROP DATABASE IF EXISTS `{LEGACY_DB}`")
        cur.execute(
            f"CREATE DATABASE `{LEGACY_DB}` "
            "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
        )
        conn.commit()
    finally:
        conn.close()


def import_legacy_dump(database_url: str, sql_path: str) -> None:
    if not os.path.isfile(sql_path):
        raise MigrationError("file_not_found", "No se encontró el archivo de backup.")
    size = os.path.getsize(sql_path)
    if size <= 0:
        raise MigrationError("file_empty", "El archivo de backup está vacío.")
    if size > MAX_DUMP_BYTES:
        raise MigrationError(
            "file_too_large",
            f"El backup supera el máximo permitido ({MAX_DUMP_BYTES // (1024 * 1024)} MB).",
        )

    db_params = parse_mysql_url(database_url)
    recreate_legacy_db(db_params)

    env = os.environ.copy()
    if db_params["password"]:
        env["MYSQL_PWD"] = db_params["password"]

    cmd = [
        "mysql",
        f"-h{db_params['host']}",
        f"-P{db_params['port']}",
        f"-u{db_params['user']}",
        LEGACY_DB,
    ]
    try:
        with open(sql_path, "rb") as fh:
            subprocess.run(cmd, stdin=fh, env=env, check=True, timeout=900)
    except FileNotFoundError as e:
        raise MigrationError(
            "mysql_client_missing",
            "El servidor no tiene el cliente mysql instalado para importar el backup.",
        ) from e
    except subprocess.TimeoutExpired as e:
        raise MigrationError(
            "import_timeout",
            "La importación del backup tardó demasiado. Probá con un archivo más chico o reintentá.",
        ) from e
    except subprocess.CalledProcessError as e:
        raise MigrationError(
            "import_failed",
            "No se pudo importar el backup. Verificá que sea un dump SQL de MikroWisp/MariaDB.",
        ) from e


def preview_migration(database_url: str) -> dict[str, Any]:
    db_params = parse_mysql_url(database_url)
    conn = connect(db_params)
    cur = conn.cursor()
    try:
        if not _legacy_db_exists(cur):
            raise MigrationError("legacy_missing", "Primero subí e importá un backup del sistema anterior.")
        perfiles, servers, usuarios, servicios = load_legacy(cur, db_params)
        if not usuarios:
            raise MigrationError("legacy_empty", "El backup no tiene clientes (usuarios).")
        usuarios_by_id = {int(u["id"]): u for u in usuarios}
        plans = build_plans(perfiles)
        server_rows = build_servers(servers)
        clients, client_map = build_clients(usuarios)
        conns, skipped = build_connections(servicios, usuarios_by_id, perfiles, client_map)
        return summarize_migration(
            perfiles, servers, usuarios, servicios, plans, server_rows, clients, conns, skipped
        )
    finally:
        conn.close()


def _wipe_target(cur, target_db: str):
    cur.execute("SET FOREIGN_KEY_CHECKS=0")
    for t in WIPE_TABLES:
        cur.execute(f"DELETE FROM `{target_db}`.`{t}`")
    cur.execute("SET FOREIGN_KEY_CHECKS=1")


def _insert_plans(cur, target_db, plans):
    sql = (
        f"INSERT INTO `{target_db}`.plans "
        "(id, created_at, name, profile, download_mbps, upload_mbps, price, iva_percent, is_active, rate_limit) "
        "VALUES (%(id)s, NOW(), %(name)s, %(profile)s, %(download_mbps)s, %(upload_mbps)s, "
        "%(price)s, %(iva_percent)s, %(is_active)s, NULL)"
    )
    if plans:
        cur.executemany(sql, plans)


def _insert_servers(cur, target_db, servers):
    sql = (
        f"INSERT INTO `{target_db}`.mikrotik_servers "
        "(id, created_at, name, host, port, username, password, use_ssl, local_address, ip_pool_cidrs) "
        "VALUES (%(id)s, NOW(), %(name)s, %(host)s, %(port)s, %(username)s, %(password)s, "
        "%(use_ssl)s, %(local_address)s, %(ip_pool_cidrs)s)"
    )
    if servers:
        cur.executemany(sql, servers)


def _insert_clients(cur, target_db, clients):
    sql = (
        f"INSERT INTO `{target_db}`.clients "
        "(id, created_at, kind, full_name, dni, cuit, phone, email, address, is_active, status) "
        "VALUES (%(id)s, NOW(), %(kind)s, %(full_name)s, %(dni)s, %(cuit)s, %(phone)s, "
        "%(email)s, %(address)s, %(is_active)s, %(status)s)"
    )
    if clients:
        cur.executemany(sql, clients)


def _insert_connections(cur, target_db, conns):
    sql = (
        f"INSERT INTO `{target_db}`.connections "
        "(id, created_at, client_id, service_address, location, plan_profile, plan_id, "
        "mikrotik_profile, status, server_id, ip, ip_is_fixed, pppoe_username, pppoe_password, "
        "billing_day, prorate_first_month, pon_sn) "
        "VALUES (%(id)s, COALESCE(%(created_at)s, NOW()), %(client_id)s, %(service_address)s, "
        "%(location)s, %(plan_profile)s, %(plan_id)s, %(mikrotik_profile)s, %(status)s, "
        "%(server_id)s, %(ip)s, %(ip_is_fixed)s, %(pppoe_username)s, %(pppoe_password)s, "
        "%(billing_day)s, %(prorate_first_month)s, %(pon_sn)s)"
    )
    if conns:
        cur.executemany(sql, conns)


def _write_client_map(cur, target_db, client_map):
    cur.execute(
        f"CREATE TABLE IF NOT EXISTS `{target_db}`.legacy_client_map ("
        "old_usuario_id INT NOT NULL PRIMARY KEY, new_client_id BIGINT NOT NULL, "
        "KEY (new_client_id))"
    )
    cur.execute(f"DELETE FROM `{target_db}`.legacy_client_map")
    if client_map:
        cur.executemany(
            f"INSERT INTO `{target_db}`.legacy_client_map (old_usuario_id, new_client_id) "
            "VALUES (%s, %s)",
            list(client_map.items()),
        )


def apply_migration(database_url: str) -> dict[str, Any]:
    db_params = parse_mysql_url(database_url)
    conn = connect(db_params)
    cur = conn.cursor()
    target_db = db_params["target_db"]
    try:
        if not _legacy_db_exists(cur):
            raise MigrationError("legacy_missing", "Primero subí e importá un backup del sistema anterior.")
        perfiles, servers, usuarios, servicios = load_legacy(cur, db_params)
        if not usuarios:
            raise MigrationError("legacy_empty", "El backup no tiene clientes (usuarios).")
        usuarios_by_id = {int(u["id"]): u for u in usuarios}
        plans = build_plans(perfiles)
        server_rows = build_servers(servers)
        clients, client_map = build_clients(usuarios)
        conns, skipped = build_connections(servicios, usuarios_by_id, perfiles, client_map)
        summary = summarize_migration(
            perfiles, servers, usuarios, servicios, plans, server_rows, clients, conns, skipped
        )
        _wipe_target(cur, target_db)
        _insert_plans(cur, target_db, plans)
        _insert_servers(cur, target_db, server_rows)
        _insert_clients(cur, target_db, clients)
        _insert_connections(cur, target_db, conns)
        _write_client_map(cur, target_db, client_map)
        conn.commit()
        summary["applied"] = True
        summary["applied_at"] = datetime.now(timezone.utc).isoformat()
        return summary
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def save_uploaded_dump(filename: str, raw: bytes) -> str:
    os.makedirs(MIGRATION_DIR, exist_ok=True)
    safe = re.sub(r"[^A-Za-z0-9._-]+", "_", filename or "backup.sql").strip("._") or "backup.sql"
    if not safe.lower().endswith(".sql"):
        safe = f"{safe}.sql"
    path = os.path.join(MIGRATION_DIR, safe)
    with open(path, "wb") as fh:
        fh.write(raw)
    return path
