"""Control de acceso por roles (ACL) y auditoría de acciones del panel.

Toda ruta `/api/*` del panel pasa por `enforce_acl` antes de ejecutarse: exige
un token de staff válido y el permiso del módulo según el método HTTP
(GET → ver, POST/PUT/PATCH → crear/editar, DELETE → eliminar). Las rutas
públicas (login, portal de clientes, webhooks, health) quedan afuera.

`record_activity` registra después cada acción que modifica algo.
"""

import json
import logging
import re
from datetime import datetime
from typing import Callable, Optional, Union

from flask import current_app, g, jsonify, request
from flask_jwt_extended import get_jwt, get_jwt_identity, verify_jwt_in_request

from .extensions import db

logger = logging.getLogger(__name__)

VIEW, EDIT, DELETE = "view", "edit", "delete"

ACTION_LABELS = {VIEW: "Ver", EDIT: "Crear / editar", DELETE: "Eliminar"}

# (id, etiqueta, acciones disponibles)
MODULES: list[tuple[str, str, list[str]]] = [
    ("dashboard", "Inicio", [VIEW]),
    ("clients", "Clientes, conexiones y reclamos", [VIEW, EDIT, DELETE]),
    ("installations", "Instalaciones", [VIEW, EDIT]),
    ("billing", "Cobranza", [VIEW, EDIT]),
    ("invoices", "Facturas", [VIEW, EDIT, DELETE]),
    ("payments", "Pagos", [VIEW, EDIT]),
    # Credenciales/hosts de red: solo administradores pueden mutarlos.
    ("network", "Red", [VIEW]),
    ("plans", "Planes", [VIEW, EDIT, DELETE]),
    ("jobs", "Tareas / Crons", [VIEW, EDIT]),
    ("logs", "Logs", [VIEW, EDIT]),
    # Secrets, certificados y migraciones SQL: solo administradores mutan.
    ("settings", "Configuración", [VIEW]),
    # La mutación de usuarios y roles es exclusivamente administrativa.
    ("users", "Usuarios y roles", [VIEW]),
]
MODULE_LABELS = {m: label for m, label, _ in MODULES}
MODULE_ACTIONS = {m: actions for m, _, actions in MODULES}

# Blueprints sin control del ACL (tienen su propia autenticación o son públicos).
PUBLIC_BLUEPRINTS = {"auth", "portal", "mp_webhook", "maps_webhooks", "health"}

BLUEPRINT_MODULE = {
    "dashboard": "dashboard",
    "clients": "clients",
    "connections": "clients",
    "complaints": "clients",
    "installations": "installations",
    "billing": "billing",
    "invoices": "invoices",
    "payments": "payments",
    "network": "network",
    "plans": "plans",
    "jobs": "jobs",
    "logs": "logs",
    "settings": "settings",
    "users": "users",
    "roles": "users",
}

# Entidad afectada por blueprint, para armar el resumen legible de cada acción.
_ENTITY = {
    "clients": "cliente",
    "connections": "conexión",
    "complaints": "reclamo",
    "installations": "instalación",
    "billing": "facturación",
    "invoices": "factura",
    "payments": "pago",
    "network": "servidor",
    "plans": "plan",
    "jobs": "tarea",
    "logs": "configuración de logs",
    "settings": "configuración",
    "users": "usuario",
    "roles": "rol",
}

_SUB_ACTIONS = {
    "cut": "Cortó el servicio de",
    "restore": "Restauró el servicio de",
    "suspend_services": "Suspendió los servicios de",
    "issue": "Emitió",
    "send_email": "Envió por email",
    "retry": "Reintentó",
    "cancel": "Canceló",
    "confirm": "Confirmó",
    "retry-check": "Reverificó cobertura de",
    "generate": "Generó",
    "update-services": "Actualizó servicios según",
    "test": "Probó la conexión de",
    "recover-stuck": "Recuperó tareas trabadas de",
    "preview": "Previsualizó",
    "upload": "Subió archivo de",
    "apply": "Aplicó",
    "arca-certs": "Subió certificados ARCA a",
    "portal": "Editó el acceso al portal de",
    "kv": "Editó",
    "issuer": "Editó datos del emisor en",
    "config": "Editó",
}

Requirement = Union[None, list[str], Callable[[], Optional[list[str]]]]


def _kv_requirement() -> list[str]:
    # Clientes lee los precios de planes legacy desde settings.
    prefix = (request.args.get("prefix") or "").strip()
    if prefix.startswith("plan.price."):
        return ["settings.view", "clients.view", "plans.view"]
    return ["settings.view"]


# Lecturas cruzadas entre pantallas. Una lista = alcanza con cualquiera de
# esos permisos; nunca se deja una lectura sensible abierta a todo el panel.
ENDPOINT_OVERRIDES: dict[str, Requirement] = {
    "plans.list_plans": ["plans.view", "clients.view", "billing.view", "invoices.view", "installations.view"],
    "network.list_servers": ["network.view", "clients.edit", "installations.edit"],
    "settings.get_safety": ["settings.view", "network.view"],
    "settings.get_kv": _kv_requirement,
    "clients.list_clients": ["clients.view", "invoices.view", "payments.view", "installations.view", "billing.view"],
    "clients.get_client": ["clients.view", "invoices.view", "payments.view", "installations.view"],
    "invoices.list_invoices": ["invoices.view", "clients.view"],
    "invoices.afip_status": ["invoices.view", "settings.view"],
    "billing.billing_status": ["billing.view", "settings.view"],
    "installations.preview_coverage": ["installations.view", "clients.view"],
    "logs.list_modules": ["logs.view"],
}


def _method_action(method: str) -> str:
    if method == "DELETE":
        return DELETE
    if method in ("POST", "PUT", "PATCH"):
        return EDIT
    return VIEW


def user_permissions(user) -> dict[str, list[str]]:
    if user is None:
        return {}
    if user.is_admin:
        return {m: list(actions) for m, actions in MODULE_ACTIONS.items()}
    perms = user.role_ref.get_permissions() if user.role_ref else {}
    return {m: [a for a in perms.get(m, []) if a in MODULE_ACTIONS.get(m, [])] for m in MODULE_ACTIONS}


def has_permission(user, perm: str) -> bool:
    if user is None:
        return False
    if user.is_admin:
        return True
    module, _, action = perm.partition(".")
    return action in user_permissions(user).get(module, [])


def _required_permissions() -> Optional[list[str]]:
    endpoint = request.endpoint or ""
    if endpoint in ENDPOINT_OVERRIDES:
        req = ENDPOINT_OVERRIDES[endpoint]
        return req() if callable(req) else req
    module = BLUEPRINT_MODULE.get(request.blueprint or "")
    if not module:
        # Blueprint del panel sin módulo asignado: solo administradores.
        return ["__admin__"]
    return [f"{module}.{_method_action(request.method)}"]


def _unauthorized(message: str = "Iniciá sesión para continuar."):
    return jsonify({"error": "unauthorized", "message": message}), 401


def current_staff_user():
    """Usuario del panel del request actual (o None)."""
    return g.get("current_user")


def load_staff_user():
    """Valida el token de staff del request y devuelve el usuario activo."""
    from .models.user import User

    verify_jwt_in_request()
    claims = get_jwt() or {}
    if claims.get("typ") != "staff":
        return None
    try:
        user = User.query.get(int(get_jwt_identity()))
    except (TypeError, ValueError):
        return None
    if not user or not user.is_active:
        return None
    try:
        token_auth_version = int(claims.get("auth_version"))
    except (TypeError, ValueError):
        return None
    if token_auth_version != int(user.auth_version or 0):
        return None
    return user


def enforce_acl():
    if request.method == "OPTIONS" or not request.path.startswith("/api/"):
        return None
    if request.blueprint is None or request.blueprint in PUBLIC_BLUEPRINTS:
        return None

    try:
        user = load_staff_user()
    except Exception:
        return _unauthorized()
    if user is None:
        return _unauthorized("Tu sesión no es válida. Volvé a iniciar sesión.")
    g.current_user = user

    required = _required_permissions()
    if not required:
        return None
    if user.is_admin or any(p != "__admin__" and has_permission(user, p) for p in required):
        return None

    module = BLUEPRINT_MODULE.get(request.blueprint or "")
    action = _method_action(request.method)
    label = MODULE_LABELS.get(module or "", "esta sección")
    message = f"No tenés permiso para «{ACTION_LABELS[action].lower()}» en {label}."
    log_activity(
        action="DENIED",
        module=module,
        summary=f"Acceso denegado: {ACTION_LABELS[action].lower()} en {label}",
        user=user,
        status_code=403,
    )
    return jsonify({"error": "forbidden", "message": message, "required": required}), 403


# ─────────────────────────────────────────────
# Auditoría
# ─────────────────────────────────────────────

_SENSITIVE = re.compile(r"pass|token|secret|pem|api_key|private", re.IGNORECASE)
_MAX_DETAILS = 4000


def _sanitize(value, depth: int = 0):
    if depth > 4:
        return "…"
    if isinstance(value, dict):
        return {
            str(k): ("***" if _SENSITIVE.search(str(k)) else _sanitize(v, depth + 1))
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [_sanitize(v, depth + 1) for v in value[:50]]
    if isinstance(value, str) and len(value) > 500:
        return value[:500] + "…"
    return value


def _request_details() -> Optional[str]:
    data = None
    if request.is_json:
        data = _sanitize(request.get_json(silent=True))
    elif request.files:
        data = {"archivos": [f.filename for f in request.files.values()]}
    if request.args:
        args = {k: v for k, v in request.args.items() if k != "jwt"}
        if args:
            data = {"query": _sanitize(args), "body": data} if data is not None else {"query": _sanitize(args)}
    if data in (None, {}, []):
        return None
    text = json.dumps(data, ensure_ascii=False, default=str)
    return text[:_MAX_DETAILS]


def _client_ip() -> str:
    return (request.remote_addr or "")[:64]


def _describe_request() -> tuple[str, str, Optional[int]]:
    """Devuelve (acción, resumen, ref_id) para el request actual."""
    bp_name = request.blueprint or ""
    bp = current_app.blueprints.get(bp_name)
    prefix = (bp.url_prefix or "") if bp else ""
    rest = request.path[len(prefix):] if request.path.startswith(prefix) else request.path
    parts = [p for p in rest.strip("/").split("/") if p]
    ref_id = next((int(p) for p in parts if p.isdigit()), None)
    sub = next((p for p in reversed(parts) if not p.isdigit()), None)
    entity = _ENTITY.get(bp_name, bp_name or "recurso")
    target = f"{entity} #{ref_id}" if ref_id else entity

    if request.method == "DELETE":
        return "DELETE", f"Eliminó {target}", ref_id
    if sub and sub in _SUB_ACTIONS:
        return ("UPDATE" if request.method in ("PUT", "PATCH") else "ACTION"), f"{_SUB_ACTIONS[sub]} {target}", ref_id
    if request.method in ("PUT", "PATCH"):
        return "UPDATE", f"Editó {target}", ref_id
    if ref_id or sub:
        label = sub.replace("-", " ").replace("_", " ") if sub else "acción"
        return "ACTION", f"Ejecutó «{label}» en {target}", ref_id
    return "CREATE", f"Creó {entity}", None


def log_activity(
    *,
    action: str,
    summary: str,
    module: Optional[str] = None,
    user=None,
    username: Optional[str] = None,
    status_code: Optional[int] = None,
    ref_id: Optional[int] = None,
    details: Optional[dict] = None,
    include_request: bool = True,
) -> None:
    """Guarda una acción de usuario en una transacción propia.

    Usa una conexión aparte para no confirmar ni revertir cambios pendientes de
    la sesión del request.
    """
    from .models.auth_security import UserActivity

    try:
        payload = json.dumps(_sanitize(details), ensure_ascii=False, default=str)[:_MAX_DETAILS] if details else None
        if payload is None and include_request:
            payload = _request_details()
        values = {
            "created_at": datetime.utcnow(),
            "user_id": getattr(user, "id", None),
            "username": (getattr(user, "username", None) or username or "")[:190] or None,
            "action": action[:32],
            "module": module,
            "summary": summary[:255],
            "method": request.method if include_request else None,
            "path": request.path[:255] if include_request else None,
            "status_code": status_code,
            "ref_id": ref_id,
            "ip": _client_ip(),
            "user_agent": (request.headers.get("User-Agent") or "")[:255] or None,
            "details": payload,
        }
        with db.engine.begin() as conn:
            conn.execute(UserActivity.__table__.insert().values(**values))
    except Exception as e:
        logger.warning("No se pudo registrar la actividad de usuario: %s", e)


def record_activity(response):
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return response
    user = current_staff_user()
    if user is None or request.blueprint in PUBLIC_BLUEPRINTS:
        return response
    if response.status_code in (401, 403):
        return response
    action, summary, ref_id = _describe_request()
    if response.status_code >= 400:
        summary = f"{summary} (falló: {response.status_code})"
    log_activity(
        action=action,
        module=BLUEPRINT_MODULE.get(request.blueprint or ""),
        summary=summary,
        user=user,
        status_code=response.status_code,
        ref_id=ref_id,
    )
    return response


def init_acl(app) -> None:
    app.before_request(enforce_acl)
    app.after_request(record_activity)
