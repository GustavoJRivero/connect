"""
Scheduler de vencimiento de reservas de puertos NAP.

Configurable por panel (settings en BD):
  maps.reservation.enabled    — "true" / "false" (default: true)
  maps.reservation.cron       — expresión cron de 5 campos "m h dom mon dow"
                                (default: "0 * * * *" = cada hora en punto)
  maps.reservation.ttl_hours  — plazo de espera de la reserva (default: 168 = 7 días)

En cada disparo del cron busca órdenes RESERVADO con expires_at vencido,
libera el puerto en la API de mapas (Reservados −1 / Disponibles +1) y las
pasa a estado VENCIDA.

Mismo patrón que billing_scheduler: hilo daemon en el proceso de Gunicorn,
relee configuración de BD en cada ciclo (cambios por panel aplican solos).
"""
import logging
import threading
import time
from datetime import datetime, timedelta

from croniter import croniter
from flask import Flask

logger = logging.getLogger(__name__)

_scheduler_started = False

DEFAULT_CRON = "0 * * * *"


def _config_from_db() -> tuple[bool, str]:
    from ..models.setting import Setting

    def _get(key: str, default: str) -> str:
        s = Setting.query.get(key)
        if s is None or s.value is None:
            return default
        return str(s.value).strip() or default

    raw = _get("maps.reservation.enabled", "true").lower()
    enabled = raw in ("1", "true", "yes", "on")
    cron_expr = _get("maps.reservation.cron", DEFAULT_CRON)
    if not croniter.is_valid(cron_expr):
        logger.warning("maps scheduler: cron inválido %r, uso default %r", cron_expr, DEFAULT_CRON)
        cron_expr = DEFAULT_CRON
    return enabled, cron_expr


def run_expiration_sweep(app: Flask) -> dict:
    """Barre reservas vencidas y las libera. Devuelve resumen (usable manualmente)."""
    with app.app_context():
        from ..extensions import db
        from ..logging_utils import slog
        from ..maps.service import expire_order
        from ..models.installation_order import InstallationOrder, STATUS_RESERVADO

        now = datetime.utcnow()
        expired = (
            InstallationOrder.query
            .filter(InstallationOrder.status == STATUS_RESERVADO)
            .filter(InstallationOrder.expires_at.isnot(None))
            .filter(InstallationOrder.expires_at <= now)
            .all()
        )

        processed = []
        errors = []
        for order in expired:
            try:
                expire_order(order)
                db.session.commit()
                processed.append(int(order.id))
            except Exception as e:  # noqa: BLE001 — un fallo no debe frenar el resto
                db.session.rollback()
                errors.append({"order_id": int(order.id), "error": str(e)[:200]})
                logger.exception("maps scheduler: error venciendo orden %s", order.id)

        if processed or errors:
            slog(
                module="INSTALL",
                action="RESERVATION_SWEEP",
                message=f"Cron de reservas: {len(processed)} vencidas liberadas, {len(errors)} errores",
                details={"expired_order_ids": processed, "errors": errors},
            )
        return {"expired": processed, "errors": errors, "checked_at": now.isoformat()}


def _scheduler_loop(app: Flask):
    """Loop: calcula el próximo disparo según el cron configurado y ejecuta el barrido."""
    # Evita disparos duplicados si el loop itera más de una vez dentro del mismo minuto.
    last_fire: datetime | None = None

    while True:
        try:
            with app.app_context():
                enabled, cron_expr = _config_from_db()
            if not enabled:
                time.sleep(60)
                continue

            now = datetime.now()
            # ¿El cron "matchea" el minuto actual? croniter con get_prev nos da el
            # último disparo programado; si cae en este minuto y no lo corrimos, va.
            prev_fire = croniter(cron_expr, now).get_prev(datetime)
            due = prev_fire >= now.replace(second=0, microsecond=0) - timedelta(seconds=0)
            already_ran = last_fire is not None and last_fire >= prev_fire
            if due and not already_ran:
                last_fire = prev_fire
                try:
                    result = run_expiration_sweep(app)
                    if result["expired"]:
                        logger.info("maps scheduler: %d reservas vencidas liberadas", len(result["expired"]))
                except Exception:
                    logger.exception("maps scheduler: error en barrido")
        except Exception:
            logger.exception("maps scheduler: error en loop")
            time.sleep(60)
            continue

        time.sleep(30)


def start_maps_scheduler(app: Flask):
    """Inicia el scheduler de reservas en un hilo daemon (mismo proceso que Gunicorn)."""
    global _scheduler_started
    if _scheduler_started:
        return

    t = threading.Thread(target=_scheduler_loop, args=(app,), daemon=True, name="maps-reservations-scheduler")
    t.start()
    _scheduler_started = True

    with app.app_context():
        from ..logging_utils import slog

        enabled, cron_expr = _config_from_db()
        slog(
            module="SYSTEM",
            action="SCHEDULER_STARTED",
            message=(
                "Hilo de scheduler de reservas NAP iniciado "
                f"({'habilitado' if enabled else 'deshabilitado'}; cron: {cron_expr})"
            ),
            details={"enabled_in_db": enabled, "cron": cron_expr},
        )
