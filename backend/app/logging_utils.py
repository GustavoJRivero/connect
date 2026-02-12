"""
Utilidad centralizada de logging.

Combina:
1. Python logger estándar (consola / archivo)
2. Persistencia en base de datos (tabla system_logs)

Configurable por módulo:
  setting `logging.{module}.enabled` = "true"/"false"
  setting `logging.enabled` = "true"/"false"  (master switch)

Uso:
  from app.logging_utils import slog

  slog(
      module="BILLING",
      action="INVOICE_CREATED",
      message="Factura generada para conexión #123",
      level="INFO",
      details={"connection_id": 123, "total": 15000},
      ref_id=456,
      ref_type="invoice",
  )

Estándar de formato (en consola):
  [BILLING] [INVOICE_CREATED] Factura generada para conexión #123 | connection_id=123 total=15000
"""
import json
import logging
from datetime import datetime
from typing import Optional

logger = logging.getLogger("sistema")

# Cache de settings para evitar N queries por ciclo de facturación
_settings_cache: dict = {}
_cache_ts: float = 0
_CACHE_TTL = 30  # segundos


def _refresh_cache():
    """Carga los settings de logging en memoria (TTL de 30s)."""
    import time
    global _settings_cache, _cache_ts

    now = time.monotonic()
    if now - _cache_ts < _CACHE_TTL and _settings_cache:
        return

    try:
        from .models.setting import Setting
        rows = Setting.query.filter(Setting.key.like("logging.%")).all()
        _settings_cache = {r.key: r.value for r in rows}
        _cache_ts = now
    except Exception:
        # Si no hay contexto de app o DB no disponible, permitir todo
        pass


def _is_enabled(module: str) -> bool:
    """Determina si el logging está habilitado para un módulo."""
    _refresh_cache()

    # Master switch
    master = _settings_cache.get("logging.enabled", "true")
    if str(master).lower() in ("0", "false", "no"):
        return False

    # Per-module switch
    mod_key = f"logging.{module.lower()}.enabled"
    mod_val = _settings_cache.get(mod_key, "true")
    return str(mod_val).lower() not in ("0", "false", "no")


def invalidate_cache():
    """Fuerza recarga del cache de settings en la próxima llamada."""
    global _cache_ts
    _cache_ts = 0


def _format_details(details: Optional[dict]) -> str:
    """Formatea detalles como key=value para la salida de consola."""
    if not details:
        return ""
    parts = []
    for k, v in details.items():
        parts.append(f"{k}={v}")
    return " | " + " ".join(parts)


def slog(
    *,
    module: str,
    action: str,
    message: str,
    level: str = "INFO",
    details: Optional[dict] = None,
    ref_id: Optional[int] = None,
    ref_type: Optional[str] = None,
    user_id: Optional[int] = None,
    persist: bool = True,
):
    """
    Registra un log del sistema.

    Args:
        module: Módulo funcional (BILLING, CLIENT, CONNECTION, etc.)
        action: Acción específica (START, COMPLETE, INVOICE_CREATED, ERROR, etc.)
        message: Mensaje legible
        level: Nivel (DEBUG, INFO, WARNING, ERROR)
        details: Dict con datos adicionales (se guarda como JSON)
        ref_id: ID del objeto relacionado (para filtrado)
        ref_type: Tipo del objeto (invoice, connection, client, etc.)
        user_id: ID del usuario que disparó la acción (null = sistema)
        persist: Si se guarda en DB (True por defecto)
    """
    module = module.upper()
    action = action.upper()
    level = level.upper()

    # Siempre loguear a consola (Python logger)
    console_msg = f"[{module}] [{action}] {message}{_format_details(details)}"
    py_level = getattr(logging, level, logging.INFO)
    logger.log(py_level, console_msg)

    # Verificar si está habilitado para persistir
    if not persist or not _is_enabled(module):
        return

    # Persistir en DB
    try:
        from .extensions import db
        from .models.system_log import SystemLog

        log_entry = SystemLog(
            created_at=datetime.utcnow(),
            module=module,
            action=action,
            level=level,
            message=message,
            details=json.dumps(details, ensure_ascii=False, default=str) if details else None,
            ref_id=ref_id,
            ref_type=ref_type,
            user_id=user_id,
        )
        db.session.add(log_entry)
        db.session.commit()
    except Exception as e:
        # No queremos que un error de logging rompa la operación principal
        logger.warning("slog: no se pudo persistir log en DB: %s", e)
