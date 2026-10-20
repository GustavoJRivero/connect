"""Migración MikroWisp (base legacy) -> Connect (sistemaconnect)."""
from __future__ import annotations

import json
import os
import re
import subprocess
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from urllib.parse import unquote, urlparse

import pymysql

from ..afip.util import DEFAULT_IVA_CONDITION_COMPANY, DEFAULT_IVA_CONDITION_PERSON

LEGACY_DB = "legacy"
SERIAL_FIELD_KEY = "1745272069"
MIGRATION_DIR = os.environ.get("MIGRATION_DIR", "/app/data/migration")
MAX_DUMP_BYTES = int(os.environ.get("MIGRATION_MAX_BYTES", str(600 * 1024 * 1024)))

WIPE_TABLES = [
    "client_credit_movements",
    "client_notifications",
    "mp_checkouts",
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


LEGACY_INVOICE_TYPE = "X"

INVOICE_STATUS_MAP = {"pagado": "PAID", "anulado": "VOID"}

PAYMENT_METHOD_MAP = (
    ("efectivo", "CASH"),
    ("transferencia", "TRANSFER"),
    ("dep", "TRANSFER"),
    ("mercadopago", "MERCADOPAGO"),
    ("tarjeta", "CARD"),
)


IVA_CONDITION_BY_LABEL = (
    ("responsable inscripto", 1),
    ("monotributo", 6),
    ("exento", 4),
    ("consumidor final", 5),
)

# Clave dentro del PHP serializado de afip.pdf; las comillas pueden venir escapadas.
_SERIALIZED_FIELD = r'{key}\\?";(?:s:\d+:\\?"([^"\\]*)|i:(-?\d+)|d:(-?[\d.]+))'


def _serialized_field(blob, key):
    m = re.search(_SERIALIZED_FIELD.format(key=re.escape(key)), blob or "")
    if not m:
        return None
    return next(g for g in m.groups() if g is not None)


def iva_condition_from_label(label):
    low = (label or "").strip().lower()
    for key, code in IVA_CONDITION_BY_LABEL:
        if key in low:
            return code
    return None


def _legacy_date(raw, length=10):
    s = (raw or "").strip()[:length]
    if not s or s.startswith("0000"):
        return None
    return s


def _dec(value) -> Decimal:
    return Decimal(str(value or 0))


def payment_method(forma):
    low = (forma or "").strip().lower()
    for key, code in PAYMENT_METHOD_MAP:
        if key in low:
            return code
    return (forma or "").strip()[:32] or None


def load_legacy_billing(cur):
    legacy = LEGACY_DB
    cur.execute(
        f"SELECT id, legal, idcliente, CAST(emitido AS CHAR) AS emitido, "
        f"CAST(vencimiento AS CHAR) AS vencimiento, total, cobrado, sub_total, iva_igv, "
        f"forma, estado FROM `{legacy}`.facturas ORDER BY id"
    )
    facturas = cur.fetchall()
    cur.execute(f"SELECT idfactura, descripcion FROM `{legacy}`.facturaitems ORDER BY id")
    items = defaultdict(list)
    for r in cur.fetchall():
        desc = (r["descripcion"] or "").strip()
        if desc:
            items[int(r["idfactura"])].append(desc)
    cur.execute(
        f"SELECT id, nfactura, idcliente, CAST(fecha_pago AS CHAR) AS fecha_pago, transaccion, "
        f"forma_pago, descripcion, descripcion_pago, cobrado, comision "
        f"FROM `{legacy}`.operaciones ORDER BY fecha_pago, id"
    )
    operaciones = cur.fetchall()
    return facturas, items, operaciones


def load_legacy_fiscal(cur):
    """Comprobantes con CAE (tabla afip) indexados por id de factura."""
    legacy = LEGACY_DB
    cur.execute(f"SELECT id, cuit FROM `{legacy}`.afipaccounts")
    cuit_by_company = {int(r["id"]): re.sub(r"\D", "", str(r["cuit"] or "")) for r in cur.fetchall()}
    cur.execute(
        f"SELECT id, idfactura, invoice_num, cae, CAST(vto AS CHAR) AS vto, total, idempresa, pdf "
        f"FROM `{legacy}`.afip WHERE idcredito = 0 ORDER BY emitido, id"
    )
    fiscal = {}
    for r in cur.fetchall():
        invoice_type = (_serialized_field(r["pdf"], "tipo_fc") or "").upper()
        pv, _, number = (r["invoice_num"] or "").partition("-")
        if invoice_type not in ("A", "B") or not pv.isdigit() or not number.isdigit():
            continue
        fiscal[int(r["idfactura"])] = {
            "invoice_type": invoice_type,
            "point_of_sale": int(pv),
            "cbte_number": int(number),
            "cae": (r["cae"] or "").strip()[:32] or None,
            "cae_due_date": _legacy_date(r["vto"]),
            "total": _dec(r["total"]),
            "issuer_cuit": cuit_by_company.get(int(r["idempresa"] or 1), ""),
            "iva_condition": iva_condition_from_label(_serialized_field(r["pdf"], "tipoiva")),
        }
    return fiscal


def apply_client_iva_conditions(clients, invoices):
    """Condición de IVA del cliente = la de su último comprobante fiscal (define A/B a futuro)."""
    latest = {}
    for inv in sorted(invoices, key=lambda x: (x["issue_date"] or "", x["id"])):
        if inv["iva_condition"] is not None:
            latest[inv["client_id"]] = inv["iva_condition"]
    for c in clients:
        default = DEFAULT_IVA_CONDITION_COMPANY if c["kind"] == "COMPANY" else DEFAULT_IVA_CONDITION_PERSON
        c["iva_condition"] = latest.get(c["id"], default)


def build_deleted_clients(facturas, operaciones, client_map):
    """Clientes borrados en MikroWisp que tienen historial: se crean RETIRED y se agregan a client_map."""
    referenced = {int(r["idcliente"]) for r in facturas} | {int(r["idcliente"]) for r in operaciones}
    rows = []
    for old_id in sorted(referenced - set(client_map)):
        rows.append(
            {
                "id": old_id,
                "kind": "PERSON",
                "full_name": f"Cliente eliminado #{old_id}",
                "dni": None,
                "cuit": None,
                "phone": None,
                "email": None,
                "address": None,
                "is_active": 0,
                "status": "RETIRED",
            }
        )
        client_map[old_id] = old_id
    return rows


def build_connection_by_owner(servicios, conns):
    """usuario viejo -> id de conexión, sólo si tenía un único servicio migrado."""
    migrated = {c["id"] for c in conns}
    by_owner = defaultdict(list)
    for s in servicios:
        if int(s["id"]) in migrated:
            by_owner[int(s["idcliente"])].append(int(s["id"]))
    return {owner: ids[0] for owner, ids in by_owner.items() if len(ids) == 1}


def build_invoices(facturas, items, client_map, conn_by_owner, issuer, fiscal):
    rows = []
    for f in facturas:
        inv_id = int(f["id"])
        owner_id = int(f["idcliente"])
        total = _dec(f["total"])
        status = INVOICE_STATUS_MAP.get((f["estado"] or "").strip().lower(), "ISSUED")
        paid_total = min(_dec(f["cobrado"]), total) if status == "PAID" else Decimal("0")
        net = _dec(f["sub_total"])
        iva = _dec(f["iva_igv"])
        iva_percent = (iva / net * 100).quantize(Decimal("1")) if net > 0 and iva > 0 else Decimal("0")
        legal = int(f["legal"] or 0)
        description = "; ".join(items.get(inv_id, []))[:500] or None
        forma = (f["forma"] or "").strip()
        notes = f"Migrado de MikroWisp: factura #{inv_id}"
        if legal:
            notes += f", N° {legal}"
        if forma:
            notes += f", forma de pago: {forma}"
        fc = fiscal.get(inv_id)
        if fc and abs(fc["total"] - total) > Decimal("0.01"):
            notes += f", total del comprobante fiscal: {fc['total']}"
        issue_date = _legacy_date(f["emitido"])
        rows.append(
            {
                "id": inv_id,
                "created_at": issue_date,
                "client_id": client_map[owner_id],
                "connection_id": conn_by_owner.get(owner_id),
                "invoice_type": fc["invoice_type"] if fc else LEGACY_INVOICE_TYPE,
                "issuer_cuit": (fc["issuer_cuit"] if fc else "") or issuer["cuit"],
                "point_of_sale": fc["point_of_sale"] if fc else issuer["point_of_sale"],
                "cbte_number": fc["cbte_number"] if fc else (legal or None),
                "cae": fc["cae"] if fc else None,
                "cae_due_date": fc["cae_due_date"] if fc else None,
                "iva_condition": fc["iva_condition"] if fc else None,
                "issue_date": issue_date,
                "due_date": _legacy_date(f["vencimiento"]),
                "total": total,
                "paid_total": paid_total,
                "iva_percent": iva_percent,
                "net_amount": net,
                "iva_amount": iva,
                "status": status,
                "description": description,
                "notes": notes,
            }
        )
    return rows


def build_payments(operaciones, invoices, client_map):
    """Devuelve (payments, allocations). Cada pago se imputa a su factura hasta cubrir el total."""
    remaining = {inv["id"]: inv["total"] for inv in invoices if inv["status"] != "VOID"}
    payments = []
    allocations = []
    for o in operaciones:
        pay_id = int(o["id"])
        amount = _dec(o["cobrado"])
        paid_at = _legacy_date(o["fecha_pago"], 19)
        note_parts = [
            (o.get("descripcion_pago") or "").strip(),
            (o.get("descripcion") or "").strip(),
        ]
        commission = _dec(o.get("comision"))
        if commission > 0:
            note_parts.append(f"Comisión: {commission}")
        reference = (o.get("transaccion") or "").strip()
        payments.append(
            {
                "id": pay_id,
                "created_at": paid_at,
                "paid_at": paid_at[:10] if paid_at else None,
                "client_id": client_map[int(o["idcliente"])],
                "amount": amount,
                "method": payment_method(o.get("forma_pago")),
                "reference": reference[:128] or None,
                "note": " · ".join(p for p in note_parts if p)[:255] or None,
            }
        )
        inv_id = int(o["nfactura"])
        open_amount = remaining.get(inv_id, Decimal("0"))
        applied = min(amount, open_amount)
        if applied > 0:
            remaining[inv_id] = open_amount - applied
            allocations.append(
                {"created_at": paid_at, "payment_id": pay_id, "invoice_id": inv_id, "amount": applied}
            )
    return payments, allocations


def summarize_billing(invoices, payments, allocations, deleted_clients):
    st = defaultdict(int)
    types = defaultdict(int)
    for inv in invoices:
        st[inv["status"]] += 1
        types[inv["invoice_type"]] += 1
    debt = sum((inv["total"] - inv["paid_total"] for inv in invoices if inv["status"] == "ISSUED"), Decimal("0"))
    return {
        "invoices": len(invoices),
        "invoice_status": dict(st),
        "invoice_types": dict(types),
        "invoices_debt_total": str(debt),
        "payments": len(payments),
        "payments_total": str(sum((p["amount"] for p in payments), Decimal("0"))),
        "payment_allocations": len(allocations),
        "deleted_clients_with_history": len(deleted_clients),
    }


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
            "pending_client_emails": _pending_client_emails(cur, target),
            "overwritable_client_emails": _overwritable_client_emails(cur, target),
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
        return _build_all(cur, db_params["target_db"])["summary"]
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
        "(id, created_at, kind, iva_condition, full_name, dni, cuit, phone, email, address, is_active, status) "
        "VALUES (%(id)s, NOW(), %(kind)s, %(iva_condition)s, %(full_name)s, %(dni)s, %(cuit)s, %(phone)s, "
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


def _write_client_emails(cur, target_db, client_emails):
    cur.execute(
        f"CREATE TABLE IF NOT EXISTS `{target_db}`.legacy_client_emails ("
        "client_id BIGINT NOT NULL PRIMARY KEY, email VARCHAR(200) NOT NULL)"
    )
    cur.execute(f"DELETE FROM `{target_db}`.legacy_client_emails")
    if client_emails:
        cur.executemany(
            f"INSERT INTO `{target_db}`.legacy_client_emails (client_id, email) VALUES (%s, %s)",
            list(client_emails.items()),
        )


_EMAIL_MISSING = "(c.email IS NULL OR c.email = '')"
_EMAIL_DIFFERENT = "(c.email IS NOT NULL AND c.email <> '' AND c.email <> e.email)"


def _count_client_emails(cur, target_db, condition) -> int | None:
    try:
        cur.execute(
            f"SELECT COUNT(*) AS c FROM `{target_db}`.legacy_client_emails e "
            f"JOIN `{target_db}`.clients c ON c.id = e.client_id WHERE {condition}"
        )
        row = cur.fetchone()
        return int(row["c"]) if row else 0
    except Exception:
        return None


def _pending_client_emails(cur, target_db) -> int | None:
    return _count_client_emails(cur, target_db, _EMAIL_MISSING)


def _overwritable_client_emails(cur, target_db) -> int | None:
    return _count_client_emails(cur, target_db, _EMAIL_DIFFERENT)


def apply_client_emails(database_url: str, overwrite: bool = False) -> dict[str, Any]:
    """Copia los emails guardados en la migración a los clientes sin email
    (o también pisa los distintos, si overwrite)."""
    db_params = parse_mysql_url(database_url)
    target_db = db_params["target_db"]
    conn = connect(db_params)
    cur = conn.cursor()
    try:
        if _pending_client_emails(cur, target_db) is None:
            raise MigrationError("emails_missing", "Primero importá los clientes desde el backup.")
        condition = f"({_EMAIL_MISSING} OR {_EMAIL_DIFFERENT})" if overwrite else _EMAIL_MISSING
        updated = cur.execute(
            f"UPDATE `{target_db}`.clients c JOIN `{target_db}`.legacy_client_emails e "
            f"ON e.client_id = c.id SET c.email = e.email WHERE {condition}"
        )
        conn.commit()
        return {"updated": int(updated)}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _get_target_setting(cur, target_db, key, default=None):
    cur.execute(f"SELECT value FROM `{target_db}`.settings WHERE `key`=%s", (key,))
    row = cur.fetchone()
    return row["value"] if row and row["value"] not in (None, "") else default


def _read_issuer(cur, target_db) -> dict[str, Any]:
    return {
        "cuit": str(_get_target_setting(cur, target_db, "issuer.cuit", "")),
        "point_of_sale": int(_get_target_setting(cur, target_db, "issuer.point_of_sale", "2")),
    }


def _insert_invoices(cur, target_db, invoices):
    sql = (
        f"INSERT INTO `{target_db}`.invoices "
        "(id, created_at, client_id, connection_id, invoice_type, issuer_cuit, point_of_sale, "
        "cbte_number, issue_date, due_date, period_start, period_end, currency, total, paid_total, "
        "iva_percent, net_amount, iva_amount, iva_condition, status, description, notes, is_deleted, "
        "cae, cae_due_date) "
        "VALUES (%(id)s, COALESCE(%(created_at)s, NOW()), %(client_id)s, %(connection_id)s, "
        "%(invoice_type)s, %(issuer_cuit)s, %(point_of_sale)s, %(cbte_number)s, %(issue_date)s, "
        "%(due_date)s, NULL, NULL, 'ARS', %(total)s, %(paid_total)s, %(iva_percent)s, "
        "%(net_amount)s, %(iva_amount)s, %(iva_condition)s, %(status)s, %(description)s, %(notes)s, 0, "
        "%(cae)s, %(cae_due_date)s)"
    )
    if invoices:
        cur.executemany(sql, invoices)


def _insert_payments(cur, target_db, payments, allocations):
    sql = (
        f"INSERT INTO `{target_db}`.payments "
        "(id, created_at, paid_at, client_id, amount, method, reference, note, created_by_user_id) "
        "VALUES (%(id)s, COALESCE(%(created_at)s, NOW()), %(paid_at)s, %(client_id)s, %(amount)s, "
        "%(method)s, %(reference)s, %(note)s, NULL)"
    )
    if payments:
        cur.executemany(sql, payments)
    sql = (
        f"INSERT INTO `{target_db}`.payment_allocations (created_at, payment_id, invoice_id, amount) "
        "VALUES (COALESCE(%(created_at)s, NOW()), %(payment_id)s, %(invoice_id)s, %(amount)s)"
    )
    if allocations:
        cur.executemany(sql, allocations)


def _bump_invoice_counters(cur, target_db, invoices):
    """Deja la numeración interna de cada PV + tipo después del último número migrado."""
    max_by_key = defaultdict(int)
    for inv in invoices:
        if inv["cbte_number"]:
            key = f"invoice.next.{inv['point_of_sale']}.{inv['invoice_type']}"
            max_by_key[key] = max(max_by_key[key], int(inv["cbte_number"]))
    for key, max_number in max_by_key.items():
        current = int(_get_target_setting(cur, target_db, key, "1"))
        cur.execute(
            f"INSERT INTO `{target_db}`.settings (`key`, value, updated_at) VALUES (%s, %s, NOW()) "
            "ON DUPLICATE KEY UPDATE value=VALUES(value), updated_at=NOW()",
            (key, str(max(current, max_number + 1))),
        )


def _build_all(cur, target_db):
    perfiles, servers, usuarios, servicios = load_legacy(cur, None)
    if not usuarios:
        raise MigrationError("legacy_empty", "El backup no tiene clientes (usuarios).")
    facturas, items, operaciones = load_legacy_billing(cur)
    usuarios_by_id = {int(u["id"]): u for u in usuarios}
    plans = build_plans(perfiles)
    server_rows = build_servers(servers)
    clients, client_map = build_clients(usuarios)
    conns, skipped = build_connections(servicios, usuarios_by_id, perfiles, client_map)
    deleted_clients = build_deleted_clients(facturas, operaciones, client_map)
    # Los emails no se cargan en clients para no mandarles correos a todos al migrar:
    # quedan en legacy_client_emails hasta correr apply_client_emails.
    client_emails = {c["id"]: c["email"] for c in clients if c["email"]}
    for c in clients:
        c["email"] = None
    issuer = _read_issuer(cur, target_db)
    invoices = build_invoices(
        facturas, items, client_map, build_connection_by_owner(servicios, conns), issuer,
        load_legacy_fiscal(cur),
    )
    apply_client_iva_conditions(clients + deleted_clients, invoices)
    payments, allocations = build_payments(operaciones, invoices, client_map)
    summary = summarize_migration(
        perfiles, servers, usuarios, servicios, plans, server_rows, clients, conns, skipped
    )
    summary.update(summarize_billing(invoices, payments, allocations, deleted_clients))
    summary["client_emails_pending"] = len(client_emails)
    return {
        "client_emails": client_emails,
        "plans": plans,
        "servers": server_rows,
        "clients": clients + deleted_clients,
        "client_map": client_map,
        "connections": conns,
        "invoices": invoices,
        "payments": payments,
        "allocations": allocations,
        "issuer": issuer,
        "summary": summary,
    }


def apply_migration(database_url: str) -> dict[str, Any]:
    db_params = parse_mysql_url(database_url)
    conn = connect(db_params)
    cur = conn.cursor()
    target_db = db_params["target_db"]
    try:
        if not _legacy_db_exists(cur):
            raise MigrationError("legacy_missing", "Primero subí e importá un backup del sistema anterior.")
        data = _build_all(cur, target_db)
        summary = data["summary"]
        _wipe_target(cur, target_db)
        _insert_plans(cur, target_db, data["plans"])
        _insert_servers(cur, target_db, data["servers"])
        _insert_clients(cur, target_db, data["clients"])
        _insert_connections(cur, target_db, data["connections"])
        _write_client_map(cur, target_db, data["client_map"])
        _write_client_emails(cur, target_db, data["client_emails"])
        _insert_invoices(cur, target_db, data["invoices"])
        _insert_payments(cur, target_db, data["payments"], data["allocations"])
        _bump_invoice_counters(cur, target_db, data["invoices"])
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
