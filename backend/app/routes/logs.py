"""
API de logs del sistema.

Endpoints:
  GET /api/logs          – Listar logs con filtros
  GET /api/logs/modules  – Módulos disponibles
  GET /api/logs/config   – Estado de configuración de logging
  PUT /api/logs/config   – Activar/desactivar logging por módulo
"""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from ..extensions import db
from ..models.system_log import SystemLog
from ..models.setting import Setting
from ..timezone import iso_utc
from ..logging_utils import invalidate_cache

bp = Blueprint("logs", __name__, url_prefix="/api/logs")

# Módulos conocidos del sistema
KNOWN_MODULES = [
    {"id": "BILLING", "label": "Facturación"},
    {"id": "CLIENT", "label": "Clientes"},
    {"id": "CONNECTION", "label": "Conexiones"},
    {"id": "PAYMENT", "label": "Pagos"},
    {"id": "INVOICE", "label": "Facturas"},
    {"id": "NETWORK", "label": "Red / Mikrotik"},
    {"id": "AFIP", "label": "ARCA"},
    {"id": "INSTALL", "label": "Instalaciones"},
    {"id": "AUTH", "label": "Autenticación"},
    {"id": "SYSTEM", "label": "Sistema"},
]


@bp.get("")
@jwt_required(optional=True)
def list_logs():
    """
    Listar logs con filtros opcionales.

    Query params:
      module   – Filtrar por módulo (BILLING, CLIENT, etc.)
      action   – Filtrar por acción
      level    – Filtrar por nivel (INFO, WARNING, ERROR, DEBUG)
      ref_type – Filtrar por tipo de referencia (connection, client, invoice, etc.)
      ref_id   – Filtrar por ID de referencia
      q        – Búsqueda de texto en message
      limit    – Cantidad (default 50, max 200)
      offset   – Offset para paginación
      from     – Fecha desde (YYYY-MM-DD)
      to       – Fecha hasta (YYYY-MM-DD)
    """
    module = request.args.get("module")
    action = request.args.get("action")
    level = request.args.get("level")
    ref_type = request.args.get("ref_type")
    ref_id = request.args.get("ref_id")
    q = request.args.get("q")
    date_from = request.args.get("from")
    date_to = request.args.get("to")

    limit = min(int(request.args.get("limit", "50")), 200)
    offset = max(int(request.args.get("offset", "0")), 0)

    query = SystemLog.query

    if module:
        query = query.filter(SystemLog.module == module.upper())
    if action:
        query = query.filter(SystemLog.action == action.upper())
    if level:
        query = query.filter(SystemLog.level == level.upper())
    if ref_type:
        query = query.filter(SystemLog.ref_type == ref_type)
    if ref_id:
        query = query.filter(SystemLog.ref_id == int(ref_id))
    if q:
        query = query.filter(SystemLog.message.ilike(f"%{q}%"))
    if date_from:
        query = query.filter(SystemLog.created_at >= date_from)
    if date_to:
        query = query.filter(SystemLog.created_at <= f"{date_to} 23:59:59")

    total = query.count()
    items = (
        query.order_by(SystemLog.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return jsonify({
        "items": [_log_to_dict(x) for x in items],
        "total": total,
        "limit": limit,
        "offset": offset,
    })


@bp.get("/modules")
@jwt_required(optional=True)
def list_modules():
    """Retorna los módulos de logging conocidos."""
    return jsonify(KNOWN_MODULES)


@bp.get("/config")
@jwt_required(optional=True)
def get_logging_config():
    """Retorna la configuración de logging (master switch + per-module)."""
    master = Setting.query.get("logging.enabled")
    master_val = master.value if master else "true"

    modules_config = []
    for m in KNOWN_MODULES:
        key = f"logging.{m['id'].lower()}.enabled"
        s = Setting.query.get(key)
        modules_config.append({
            "module": m["id"],
            "label": m["label"],
            "enabled": str(s.value if s else "true").lower() not in ("0", "false", "no"),
        })

    return jsonify({
        "enabled": str(master_val).lower() not in ("0", "false", "no"),
        "modules": modules_config,
    })


@bp.put("/config")
@jwt_required(optional=True)
def update_logging_config():
    """
    Actualizar configuración de logging.

    Body:
    {
      "enabled": true,
      "modules": {
        "BILLING": true,
        "CLIENT": false,
        ...
      }
    }
    """
    data = request.get_json(silent=True) or {}

    if "enabled" in data:
        _set_setting("logging.enabled", "true" if data["enabled"] else "false")

    if "modules" in data and isinstance(data["modules"], dict):
        for module_id, enabled in data["modules"].items():
            key = f"logging.{module_id.lower()}.enabled"
            _set_setting(key, "true" if enabled else "false")

    db.session.commit()
    invalidate_cache()

    return jsonify({"ok": True})


# ─────────────────────────────────────────────
# Actividad de usuarios
# ─────────────────────────────────────────────

ACTIVITY_ACTIONS = [
    {"id": "CREATE", "label": "Alta"},
    {"id": "UPDATE", "label": "Edición"},
    {"id": "DELETE", "label": "Eliminación"},
    {"id": "ACTION", "label": "Acción"},
    {"id": "LOGIN", "label": "Ingreso"},
    {"id": "LOGIN_CODE_SENT", "label": "Código enviado"},
    {"id": "LOGIN_FAILED", "label": "Ingreso fallido"},
    {"id": "LOGOUT", "label": "Salida"},
    {"id": "DENIED", "label": "Acceso denegado"},
]


@bp.get("/activity")
def list_activity():
    """
    Acciones de usuarios del panel.

    Query params: user_id, module, action, q, from, to (YYYY-MM-DD), limit, offset
    """
    from ..models.auth_security import UserActivity

    query = UserActivity.query
    user_id = request.args.get("user_id")
    module = request.args.get("module")
    action = request.args.get("action")
    q = (request.args.get("q") or "").strip()
    date_from = request.args.get("from")
    date_to = request.args.get("to")

    if user_id:
        query = query.filter(UserActivity.user_id == int(user_id))
    if module:
        query = query.filter(UserActivity.module == module)
    if action:
        query = query.filter(UserActivity.action == action.upper())
    if q:
        like = f"%{q}%"
        query = query.filter(
            UserActivity.summary.ilike(like) | UserActivity.path.ilike(like) | UserActivity.username.ilike(like)
        )
    if date_from:
        query = query.filter(UserActivity.created_at >= date_from)
    if date_to:
        query = query.filter(UserActivity.created_at <= f"{date_to} 23:59:59")

    limit = min(int(request.args.get("limit", "50")), 200)
    offset = max(int(request.args.get("offset", "0")), 0)
    total = query.count()
    items = query.order_by(UserActivity.id.desc()).offset(offset).limit(limit).all()
    return jsonify({
        "items": [_activity_to_dict(x) for x in items],
        "total": total,
        "limit": limit,
        "offset": offset,
    })


@bp.get("/activity/meta")
def activity_meta():
    """Opciones de filtro: usuarios, módulos y tipos de acción."""
    from ..acl import MODULES
    from ..models.user import User

    users = User.query.order_by(User.username.asc()).all()
    return jsonify({
        "users": [{"id": u.id, "username": u.username} for u in users],
        "modules": [{"id": "auth", "label": "Acceso"}] + [{"id": m, "label": label} for m, label, _ in MODULES],
        "actions": ACTIVITY_ACTIONS,
    })


def _activity_to_dict(x) -> dict:
    import json as _json

    details = None
    if x.details:
        try:
            details = _json.loads(x.details)
        except (ValueError, TypeError):
            details = x.details
    return {
        "id": x.id,
        "created_at": iso_utc(x.created_at),
        "user_id": x.user_id,
        "username": x.username,
        "action": x.action,
        "module": x.module,
        "summary": x.summary,
        "method": x.method,
        "path": x.path,
        "status_code": x.status_code,
        "ref_id": x.ref_id,
        "ip": x.ip,
        "user_agent": x.user_agent,
        "details": details,
    }


def _set_setting(key: str, value: str):
    s = Setting.query.get(key)
    if s:
        s.value = value
    else:
        db.session.add(Setting(key=key, value=value))


def _log_to_dict(log: SystemLog) -> dict:
    import json as _json

    details = None
    if log.details:
        try:
            details = _json.loads(log.details)
        except (ValueError, TypeError):
            details = log.details

    return {
        "id": log.id,
        "created_at": iso_utc(log.created_at),
        "module": log.module,
        "action": log.action,
        "level": log.level,
        "message": log.message,
        "details": details,
        "ref_id": log.ref_id,
        "ref_type": log.ref_type,
        "user_id": log.user_id,
    }
