"""Administración de la ONU/router del cliente desde el portal (SmartOLT)."""
import time
from datetime import datetime, timedelta

from flask import jsonify, request
from flask_jwt_extended import jwt_required

from ..acl import log_activity
from ..models.auth_security import UserActivity
from ..models.connection import Connection
from ..smartolt import service
from ..smartolt.client import SmartOltError, SmartOltNotConfigured
from ..smartolt.config import smartolt_writes_disabled
from .portal import _require_client, bp

# (acción, máximo, ventana)
LIMIT_REBOOT = ("PORTAL_ONU_REBOOT", 3, timedelta(hours=1))
LIMIT_WIFI = ("PORTAL_ONU_WIFI", 5, timedelta(hours=1))
LIMIT_HOSTS = ("PORTAL_ONU_HOSTS", 15, timedelta(hours=1))

BUSY_MESSAGE = "El sistema está ocupado. Probá de nuevo en unos segundos."


def _error(code: str, message: str, status: int):
    return jsonify({"error": code, "message": message}), status


def _own_connection(client, connection_id: int):
    conn = Connection.query.get(connection_id)
    if not conn or int(conn.client_id) != int(client.id):
        return None, _error("connection_not_found", "La conexión no es tuya.", 404)
    return conn, None


def _limited(client, limit: tuple) -> bool:
    action, max_count, window = limit
    since = datetime.utcnow() - window
    return (
        UserActivity.query.filter(
            UserActivity.action == action,
            UserActivity.ref_id == client.id,
            UserActivity.created_at >= since,
        ).count()
        >= max_count
    )


def _log(client, limit: tuple, summary: str, conn: Connection, status_code: int, details: dict | None = None):
    log_activity(
        action=limit[0],
        module="portal",
        summary=summary,
        username=f"portal:{client.id}",
        ref_id=int(client.id),
        status_code=status_code,
        details={"connection_id": int(conn.id), **(details or {})},
    )


def _smartolt_error(e: SmartOltError):
    if isinstance(e, SmartOltNotConfigured):
        return _error("smartolt_not_configured", "La administración del equipo no está disponible por el momento.", 503)
    if e.status == 429:
        return _error("busy", BUSY_MESSAGE, 429)
    if e.code == "tr069_unable_to_process_command":
        return _error(
            "device_unreachable",
            "No pudimos comunicarnos con tu equipo. Verificá que esté encendido y probá más tarde.",
            409,
        )
    if e.code == "smartolt_unreachable":
        return _error("smartolt_unreachable", "No pudimos consultar tu equipo. Probá más tarde.", 502)
    return _error("smartolt_error", "No pudimos completar la operación con tu equipo. Probá más tarde.", 502)


def _resolve(client, connection_id: int):
    conn, err = _own_connection(client, connection_id)
    if err:
        return None, None, err
    try:
        return conn, service.resolve_onu(conn), None
    except service.OnuUnavailable as e:
        return conn, None, _error(e.code, e.message, 404)
    except SmartOltError as e:
        return conn, None, _smartolt_error(e)


def _restore_reboot(client, conn: Connection, onu: dict) -> None:
    """Recupera un reinicio en curso desde el log (p. ej. después de reiniciar el backend)."""
    if service.is_rebooting(onu["external_id"]):
        return
    since = datetime.utcnow() - timedelta(seconds=service.REBOOT_MAX_SECONDS)
    last = (
        UserActivity.query.filter(
            UserActivity.action == LIMIT_REBOOT[0],
            UserActivity.ref_id == client.id,
            UserActivity.status_code == 200,
            UserActivity.path == f"/api/portal/connections/{conn.id}/onu/reboot",
            UserActivity.created_at >= since,
        )
        .order_by(UserActivity.created_at.desc())
        .first()
    )
    if last:
        elapsed = (datetime.utcnow() - last.created_at).total_seconds()
        service.mark_rebooting(onu["external_id"], time.time() - elapsed)


@bp.get("/connections/<int:connection_id>/onu")
@jwt_required()
def onu_overview(connection_id: int):
    client, err = _require_client()
    if err:
        return err
    conn, onu, err = _resolve(client, connection_id)
    if err:
        return err
    out = {
        "vendor": onu["vendor"],
        "model": onu["type_name"],
        "can_manage": not smartolt_writes_disabled(),
        "rebooting": False,
        "status": None,
        "signal": None,
    }
    _restore_reboot(client, conn, onu)
    ttl = service.REBOOT_STATUS_TTL if service.is_rebooting(onu["external_id"]) else service.STATUS_TTL
    try:
        out["status"] = service.onu_status(onu, ttl=ttl)
    except SmartOltError as e:
        if e.status == 429:
            return _smartolt_error(e)
        out["status"] = {"state": "UNKNOWN", "level": "unknown", "label": "Desconocido", "message": "No pudimos leer el estado"}
    if service.reboot_progress(onu["external_id"], out["status"]["state"]):
        out["rebooting"] = True
        return jsonify(out)
    online = out["status"]["state"] == "ONLINE"
    if online:
        try:
            out["signal"] = service.onu_signal(onu)
        except SmartOltError:
            out["signal"] = None
    return jsonify(out)


@bp.get("/connections/<int:connection_id>/onu/wifi")
@jwt_required()
def onu_wifi(connection_id: int):
    client, err = _require_client()
    if err:
        return err
    conn, onu, err = _resolve(client, connection_id)
    if err:
        return err
    try:
        networks = service.wifi_networks(onu)
    except SmartOltError as e:
        return _smartolt_error(e)
    return jsonify({"networks": networks, "can_manage": not smartolt_writes_disabled()})


def _valid_ascii(value: str) -> bool:
    return all(32 <= ord(ch) <= 126 for ch in value)


@bp.post("/connections/<int:connection_id>/onu/wifi")
@jwt_required()
def onu_wifi_update(connection_id: int):
    client, err = _require_client()
    if err:
        return err
    data = request.get_json(force=True) or {}
    band = str(data.get("band") or "").strip()
    ssid = str(data.get("ssid") or "").strip()
    password = str(data.get("password") or "")
    if band not in ("2.4", "5"):
        return _error("invalid_band", "Elegí la red de 2.4 GHz o 5 GHz.", 400)
    if not 1 <= len(ssid) <= 32 or not _valid_ascii(ssid):
        return _error("invalid_ssid", "El nombre de la red debe tener entre 1 y 32 caracteres, sin acentos ni ñ.", 400)
    if not 8 <= len(password) <= 63 or not _valid_ascii(password):
        return _error(
            "invalid_password",
            "La contraseña debe tener entre 8 y 63 caracteres, sin acentos ni ñ.",
            400,
        )
    if smartolt_writes_disabled():
        return _error("smartolt_writes_disabled", "El cambio de WiFi está deshabilitado en este entorno.", 403)
    if _limited(client, LIMIT_WIFI):
        return _error("too_many_requests", "Hiciste varios cambios de WiFi seguidos. Probá de nuevo en una hora.", 429)
    conn, onu, err = _resolve(client, connection_id)
    if err:
        return err
    try:
        service.set_wifi(onu, band, ssid, password)
    except SmartOltError as e:
        resp = _smartolt_error(e)
        if e.status != 429:
            _log(client, LIMIT_WIFI, "Portal: cambio de WiFi fallido", conn, resp[1], {"band": band, "error": e.code})
        return resp
    _log(client, LIMIT_WIFI, f"Portal: cambio de WiFi {band} GHz", conn, 200, {"band": band, "ssid": ssid})
    return jsonify({"ok": True})


@bp.post("/connections/<int:connection_id>/onu/reboot")
@jwt_required()
def onu_reboot(connection_id: int):
    client, err = _require_client()
    if err:
        return err
    if smartolt_writes_disabled():
        return _error("smartolt_writes_disabled", "El reinicio del equipo está deshabilitado en este entorno.", 403)
    if _limited(client, LIMIT_REBOOT):
        return _error("too_many_requests", "Reiniciaste el equipo varias veces. Probá de nuevo en una hora.", 429)
    conn, onu, err = _resolve(client, connection_id)
    if err:
        return err
    _restore_reboot(client, conn, onu)
    if service.is_rebooting(onu["external_id"]):
        return _error("already_rebooting", "Tu equipo ya se está reiniciando. Esperá unos minutos.", 409)
    try:
        service.reboot(onu)
    except SmartOltError as e:
        resp = _smartolt_error(e)
        if e.status != 429:
            _log(client, LIMIT_REBOOT, "Portal: reinicio de ONU fallido", conn, resp[1], {"error": e.code})
        return resp
    _log(client, LIMIT_REBOOT, "Portal: reinicio de ONU", conn, 200)
    return jsonify({"ok": True})


@bp.get("/connections/<int:connection_id>/onu/hosts")
@jwt_required()
def onu_hosts(connection_id: int):
    client, err = _require_client()
    if err:
        return err
    if _limited(client, LIMIT_HOSTS):
        return _error("too_many_requests", "Consultaste los equipos varias veces. Probá de nuevo más tarde.", 429)
    conn, onu, err = _resolve(client, connection_id)
    if err:
        return err
    try:
        hosts = service.router_hosts(onu)
    except SmartOltError as e:
        return _smartolt_error(e)
    _log(client, LIMIT_HOSTS, "Portal: equipos conectados", conn, 200, {"count": len(hosts)})
    return jsonify({"hosts": hosts})
