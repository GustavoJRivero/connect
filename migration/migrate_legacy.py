#!/usr/bin/env python3
"""
Migración Fase 1: MikroWisp (base `legacy`) -> Connect (base `sistemaconnect`).

Migra: planes (perfiles), servidores (server), clientes (usuarios) y
servicios/conexiones (tblservicios).

Reglas clave (acordadas):
- Clientes unificados por documento: si varias filas de `usuarios` comparten el
  mismo documento (cedula normalizada), se colapsan en UN cliente con varias
  conexiones. El id del cliente sobreviviente = MIN(id) del grupo.
- `cedula` se separa en dni/cuit: 11 dígitos (o formato CUIT) -> cuit;
  7-8 dígitos -> dni; cualquier otra cosa no vacía -> dni tal cual.
- Se preservan los ids: usuarios.id -> clients.id, tblservicios.id -> connections.id,
  perfiles.id -> plans.id, server.id -> mikrotik_servers.id.
- Estado: ACTIVO -> ACTIVE; SUSPENDIDO -> cliente ACTIVE con conexión CUT;
  RETIRADO -> cliente RETIRED con conexión DISABLED.
- pon_sn se extrae del JSON `personalizados` (campo "SERIAL NUMBER", clave 1745272069).
- Credenciales de los Mikrotik vienen encriptadas en origen -> placeholder 'CONFIGURAR'.

Se crea además la tabla `legacy_client_map` (usuario viejo -> cliente nuevo) para
poder enlazar facturas/pagos en la Fase 2.

Uso:
    python migrate_legacy.py            # dry-run (no escribe nada)
    python migrate_legacy.py --commit   # ejecuta la migración
"""
import argparse
import json
import re
import sys
from collections import defaultdict

import pymysql

DB_HOST = "db"
DB_PORT = 3306
DB_USER = "root"
DB_PASS = "root"
LEGACY_DB = "legacy"
TARGET_DB = "sistemaconnect"

SERIAL_FIELD_KEY = "1745272069"  # campo personalizado "SERIAL NUMBER"

# Tablas destino a limpiar (datos de prueba) antes de importar, en este orden.
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


def connect():
    return pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASS,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
    )


# ----------------------------------------------------------------------------
# Helpers de normalización
# ----------------------------------------------------------------------------
def norm_doc(cedula):
    """Devuelve (clave_grupo, dni, cuit, kind_hint).

    - clave_grupo: string usado para agrupar (dígitos si es numérico, sino el texto).
    - dni / cuit: valor a persistir (uno de los dos, el otro None).
    - kind_hint: 'COMPANY' o 'PERSON'.
    """
    raw = (cedula or "").strip()
    if not raw:
        return (None, None, None, "PERSON")
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 11:
        # CUIT/CUIL. Prefijos 30/33/34 -> empresa.
        kind = "COMPANY" if digits[:2] in ("30", "33", "34") else "PERSON"
        return (digits, None, digits, kind)
    if 7 <= len(digits) <= 8 and digits == raw.replace(" ", ""):
        return (digits, digits, None, "PERSON")
    if 7 <= len(digits) <= 8:
        # tiene dígitos válidos de DNI aunque con basura -> usar dígitos
        return (digits, digits, None, "PERSON")
    # Cualquier otra cosa no vacía: guardar tal cual en dni, agrupar por sí mismo.
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
    """'50000K/50000K' -> (50, 50). Soporta sufijos K/M."""
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
        # sin unidad: asumir kbps
        return n // 1000

    return (one(parts[0]), one(parts[1]))


def status_map(estado):
    """estado usuario -> (client_status, connection_status, is_active)."""
    e = (estado or "").strip().upper()
    if e == "RETIRADO":
        return ("RETIRED", "DISABLED", False)
    if e == "SUSPENDIDO":
        return ("ACTIVE", "CUT", True)
    return ("ACTIVE", "ACTIVE", True)


# ----------------------------------------------------------------------------
# Lectura del origen
# ----------------------------------------------------------------------------
def load_legacy(cur):
    cur.execute(f"SELECT * FROM {LEGACY_DB}.perfiles")
    perfiles = {r["id"]: r for r in cur.fetchall()}

    cur.execute(f"SELECT * FROM {LEGACY_DB}.server")
    servers = cur.fetchall()

    cur.execute(
        f"SELECT id, nombre, estado, correo, telefono, movil, cedula, "
        f"direccion_principal FROM {LEGACY_DB}.usuarios"
    )
    usuarios = cur.fetchall()

    cur.execute(
        f"SELECT id, idcliente, idperfil, nodo, ip, pppuser, ppppass, "
        f"direccion, coordenadas, personalizados, "
        f"CAST(instalado AS CHAR) AS instalado FROM {LEGACY_DB}.tblservicios"
    )
    servicios = cur.fetchall()
    return perfiles, servers, usuarios, servicios


# ----------------------------------------------------------------------------
# Transformación
# ----------------------------------------------------------------------------
def build_plans(perfiles):
    rows = []
    # Sólo perfiles efectivamente usados se garantizan; migramos todos los que existan.
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
    """Agrupa usuarios por documento. Devuelve (clients, client_map).

    client_map: usuario_id -> client_id (cliente sobreviviente).
    """
    groups = defaultdict(list)  # group_key -> [usuario...]
    singles = []  # usuarios sin documento (cada uno su propio cliente)

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
        # estado del cliente: RETIRED sólo si TODOS retirados
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
            created_at = None  # se usará NOW() en el INSERT

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


# ----------------------------------------------------------------------------
# Escritura
# ----------------------------------------------------------------------------
def wipe_target(cur):
    cur.execute("SET FOREIGN_KEY_CHECKS=0")
    for t in WIPE_TABLES:
        cur.execute(f"DELETE FROM {TARGET_DB}.{t}")
    cur.execute("SET FOREIGN_KEY_CHECKS=1")


def insert_plans(cur, plans):
    sql = (
        f"INSERT INTO {TARGET_DB}.plans "
        "(id, created_at, name, profile, download_mbps, upload_mbps, price, iva_percent, is_active, rate_limit) "
        "VALUES (%(id)s, NOW(), %(name)s, %(profile)s, %(download_mbps)s, %(upload_mbps)s, "
        "%(price)s, %(iva_percent)s, %(is_active)s, NULL)"
    )
    cur.executemany(sql, plans)


def insert_servers(cur, servers):
    sql = (
        f"INSERT INTO {TARGET_DB}.mikrotik_servers "
        "(id, created_at, name, host, port, username, password, use_ssl, local_address, ip_pool_cidrs) "
        "VALUES (%(id)s, NOW(), %(name)s, %(host)s, %(port)s, %(username)s, %(password)s, "
        "%(use_ssl)s, %(local_address)s, %(ip_pool_cidrs)s)"
    )
    cur.executemany(sql, servers)


def insert_clients(cur, clients):
    sql = (
        f"INSERT INTO {TARGET_DB}.clients "
        "(id, created_at, kind, full_name, dni, cuit, phone, email, address, is_active, status) "
        "VALUES (%(id)s, NOW(), %(kind)s, %(full_name)s, %(dni)s, %(cuit)s, %(phone)s, "
        "%(email)s, %(address)s, %(is_active)s, %(status)s)"
    )
    cur.executemany(sql, clients)


def insert_connections(cur, conns):
    sql = (
        f"INSERT INTO {TARGET_DB}.connections "
        "(id, created_at, client_id, service_address, location, plan_profile, plan_id, "
        "mikrotik_profile, status, server_id, ip, ip_is_fixed, pppoe_username, pppoe_password, "
        "billing_day, prorate_first_month, pon_sn) "
        "VALUES (%(id)s, COALESCE(%(created_at)s, NOW()), %(client_id)s, %(service_address)s, "
        "%(location)s, %(plan_profile)s, %(plan_id)s, %(mikrotik_profile)s, %(status)s, "
        "%(server_id)s, %(ip)s, %(ip_is_fixed)s, %(pppoe_username)s, %(pppoe_password)s, "
        "%(billing_day)s, %(prorate_first_month)s, %(pon_sn)s)"
    )
    cur.executemany(sql, conns)


def write_client_map(cur, client_map):
    cur.execute(
        f"CREATE TABLE IF NOT EXISTS {TARGET_DB}.legacy_client_map ("
        "old_usuario_id INT NOT NULL PRIMARY KEY, new_client_id BIGINT NOT NULL, "
        "KEY (new_client_id))"
    )
    cur.execute(f"DELETE FROM {TARGET_DB}.legacy_client_map")
    cur.executemany(
        f"INSERT INTO {TARGET_DB}.legacy_client_map (old_usuario_id, new_client_id) "
        "VALUES (%s, %s)",
        list(client_map.items()),
    )


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--commit", action="store_true", help="Ejecuta la escritura (sino dry-run)")
    args = ap.parse_args()

    conn = connect()
    cur = conn.cursor()

    perfiles, servers, usuarios, servicios = load_legacy(cur)
    usuarios_by_id = {int(u["id"]): u for u in usuarios}

    plans = build_plans(perfiles)
    server_rows = build_servers(servers)
    clients, client_map = build_clients(usuarios)
    conns, skipped = build_connections(servicios, usuarios_by_id, perfiles, client_map)

    # Resumen
    merged = len(usuarios) - len(clients)
    print("==================== RESUMEN MIGRACIÓN (Fase 1) ====================")
    print(f"  Perfiles  -> plans            : {len(plans)}")
    print(f"  Servers   -> mikrotik_servers : {len(server_rows)}")
    print(f"  Usuarios  (origen)            : {len(usuarios)}")
    print(f"  Clientes  -> clients          : {len(clients)}  (unificados: {merged})")
    print(f"  Servicios -> connections      : {len(conns)}")
    print(f"  Servicios omitidos            : {len(skipped)}")
    if skipped:
        for sid, reason, ref in skipped[:20]:
            print(f"      - servicio {sid}: {reason} ({ref})")
    # Distribución de estados
    st = defaultdict(int)
    for c in clients:
        st[c["status"]] += 1
    print(f"  Estados cliente               : {dict(st)}")
    cst = defaultdict(int)
    for c in conns:
        cst[c["status"]] += 1
    print(f"  Estados conexión              : {dict(cst)}")
    with_pon = sum(1 for c in conns if c["pon_sn"])
    print(f"  Conexiones con pon_sn         : {with_pon}")
    print("====================================================================")

    if not args.commit:
        print("DRY-RUN: no se escribió nada. Volvé a correr con --commit para aplicar.")
        conn.rollback()
        return

    try:
        wipe_target(cur)
        insert_plans(cur, plans)
        insert_servers(cur, server_rows)
        insert_clients(cur, clients)
        insert_connections(cur, conns)
        write_client_map(cur, client_map)
        conn.commit()
        print("OK: migración aplicada y confirmada (commit).")
    except Exception as e:  # noqa
        conn.rollback()
        print(f"ERROR: se hizo rollback. Detalle: {e}", file=sys.stderr)
        raise


if __name__ == "__main__":
    main()
