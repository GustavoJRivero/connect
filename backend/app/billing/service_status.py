"""
Actualización de estado de servicios (corte / restauración).

Evalúa las conexiones según su deuda vencida:
  - ACTIVE + deuda vencida → CUT
  - CUT + sin deuda vencida → ACTIVE (restaurar)

Se invoca desde:
  - POST /api/billing/update-services (manual)
  - El scheduler diario (después de facturar)
  - Después de registrar un pago (async, via cola de jobs)

Usa el MikrotikServer asociado a cada conexión (via server_id),
igual que el resto de las rutas de conexiones.
"""

import logging
from datetime import date

from ..extensions import db
from ..mikrotik.ros_client import MikrotikRosClient
from ..models.connection import Connection
from ..models.invoice import Invoice
from ..models.mikrotik_server import MikrotikServer
from ..models.setting import Setting

logger = logging.getLogger(__name__)


def _get_setting(key: str, default=None):
    s = Setting.query.get(key)
    return s.value if s else default


def _get_mt_for_connection(conn: Connection):
    """
    Crea un MikrotikRosClient usando el server_id de la conexión.
    Devuelve (client, server) o (None, None) si no tiene servidor asignado.
    """
    if not conn.server_id:
        return None, None

    server = db.session.get(MikrotikServer, int(conn.server_id))
    if not server:
        return None, None

    mt = MikrotikRosClient(
        host=str(server.host),
        user=str(server.username),
        password=str(server.password),
        port=int(server.port or 8728),
        use_ssl=bool(server.use_ssl),
    )
    return mt, server


def _has_overdue(connection_id: int, today: date) -> bool:
    return (
        Invoice.query
        .filter_by(connection_id=connection_id)
        .filter(Invoice.status.in_(["ISSUED"]))
        .filter(Invoice.is_deleted.is_(False))
        .filter(Invoice.due_date.isnot(None))
        .filter(Invoice.due_date < today)
        .filter(Invoice.paid_total < Invoice.total)
        .count() > 0
    )


def _update_connection(conn: Connection, today: date, cut_profile: str,
                       mt_cache: dict) -> dict | None:
    """
    Evalúa una conexión individual y aplica corte o restauración.
    Usa un cache de conexiones MikroTik por server_id para no reconectar cada vez.
    Devuelve {"id", "action", "mt_error"?} o None si no hubo cambio.
    """
    overdue = _has_overdue(conn.id, today)

    if conn.status == "ACTIVE" and overdue:
        action = "cut"
        new_profile = cut_profile
    elif conn.status == "CUT" and not overdue:
        action = "restore"
        new_profile = conn.plan_profile
    else:
        return None

    mt_error = None
    sid = conn.server_id

    if sid:
        if sid not in mt_cache:
            mt, server = _get_mt_for_connection(conn)
            if mt:
                try:
                    mt.connect()
                    mt_cache[sid] = mt
                except Exception as e:
                    logger.warning("UpdateServices: no se pudo conectar a server #%d (%s): %s",
                                   sid, server.name if server else "?", e)
                    mt_cache[sid] = None
            else:
                mt_cache[sid] = None

        mt = mt_cache.get(sid)
        if mt:
            try:
                mt.set_pppoe_secret_profile(name=conn.pppoe_name(), profile=new_profile)
                mt.disconnect_pppoe_session(name=conn.pppoe_name())
            except Exception as e:
                mt_error = str(e)
                logger.warning("UpdateServices %s conn #%d: %s", action, conn.id, e)

    conn.status = "CUT" if action == "cut" else "ACTIVE"
    conn.mikrotik_profile = new_profile

    result = {"id": conn.id, "action": action}
    if mt_error:
        result["mt_error"] = mt_error
    return result


def _close_mt_cache(mt_cache: dict):
    for mt in mt_cache.values():
        if mt:
            try:
                mt.close()
            except Exception:
                pass


def update_all_services(cut_profile: str | None = None) -> dict:
    """
    Recorre TODAS las conexiones y aplica corte/restauración según deuda.
    """
    today = date.today()
    if not cut_profile:
        cut_profile = _get_setting("mikrotik.cut_profile", "suspended")

    mt_cache: dict = {}
    cut = []
    restored = []
    mt_errors = []

    try:
        conns = Connection.query.all()
        for conn in conns:
            result = _update_connection(conn, today, cut_profile, mt_cache)
            if result:
                if result["action"] == "cut":
                    cut.append(result["id"])
                else:
                    restored.append(result["id"])
                if "mt_error" in result:
                    mt_errors.append({
                        "connection_id": result["id"],
                        "action": result["action"],
                        "error": result["mt_error"],
                    })

        if cut or restored:
            db.session.commit()
            logger.info("UpdateServices global: cut=%s restored=%s", cut, restored)
    finally:
        _close_mt_cache(mt_cache)

    result_dict: dict = {"cut": cut, "restored": restored}
    if mt_errors:
        result_dict["mt_errors"] = mt_errors
    return result_dict


def update_client_services(client_id: int, cut_profile: str | None = None) -> dict:
    """
    Actualiza estado de servicios para un cliente específico.
    """
    today = date.today()
    if not cut_profile:
        cut_profile = _get_setting("mikrotik.cut_profile", "suspended")

    conns = Connection.query.filter_by(client_id=client_id).all()
    if not conns:
        return {"cut": [], "restored": []}

    mt_cache: dict = {}
    cut = []
    restored = []

    try:
        for conn in conns:
            result = _update_connection(conn, today, cut_profile, mt_cache)
            if result:
                if result["action"] == "cut":
                    cut.append(result["id"])
                else:
                    restored.append(result["id"])

        if cut or restored:
            db.session.commit()
            logger.info("UpdateServices cliente #%d: cut=%s restored=%s", client_id, cut, restored)
    finally:
        _close_mt_cache(mt_cache)

    return {"cut": cut, "restored": restored}
