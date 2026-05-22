"""
Scheduler de facturación automática.

La activación y la hora se configuran en Configuración (settings en BD):
  billing.scheduler.enabled  — "true" / "false"
  billing.scheduler.run_hour — 0-23 (hora UTC del servidor al disparar el día)

Estrategia:
1. Si está habilitado al arrancar, ejecuta catch-up para los últimos 7 días
2. Cada minuto relee la configuración; si está habilitado y ya pasó la hora UTC del día, ejecuta facturación
3. Usa BillingRun como registro → idempotente
"""
import threading
import time
import logging
from datetime import date, datetime

from flask import Flask

logger = logging.getLogger(__name__)

_scheduler_started = False


def _scheduler_config_from_db() -> tuple[bool, int]:
    """Lee billing.scheduler.* desde la tabla settings."""
    from ..models.setting import Setting

    def _get(key: str, default: str) -> str:
        s = Setting.query.get(key)
        if s is None or s.value is None:
            return default
        return str(s.value).strip() or default

    raw = _get("billing.scheduler.enabled", "false").lower()
    enabled = raw in ("1", "true", "yes", "on")
    try:
        hour = int(_get("billing.scheduler.run_hour", "6"))
    except ValueError:
        hour = 6
    hour = max(0, min(23, hour))
    return enabled, hour


def _run_daily(app: Flask):
    """Ejecuta la facturación del día usando el motor centralizado."""
    with app.app_context():
        from ..billing.engine import run_billing
        from ..logging_utils import slog
        from ..models.billing_run import BillingRun

        today = date.today()

        existing = (
            BillingRun.query
            .filter_by(billing_date=today, status="COMPLETED")
            .first()
        )
        if existing:
            logger.debug("Billing scheduler: ya ejecutado hoy (run #%d)", existing.id)
            return

        slog(
            module="BILLING",
            action="SCHEDULER_TRIGGER",
            message=f"Scheduler diario activado para {today.isoformat()}",
            details={"date": today.isoformat()},
        )

        result = run_billing(
            billing_date=today,
            issue=True,
            trigger="SCHEDULER",
        )

        logger.info(
            "Billing scheduler: %s → created=%d skipped=%d errors=%d duration=%dms",
            today.isoformat(),
            result["created"],
            result["skipped"],
            len(result["errors"]),
            result.get("duration_ms", 0),
        )

        try:
            from ..billing.service_status import update_all_services
            svc_result = update_all_services()
            logger.info(
                "Billing scheduler: actualización de servicios: cut=%d restored=%d",
                len(svc_result.get("cut", [])),
                len(svc_result.get("restored", [])),
            )
        except Exception:
            logger.exception("Billing scheduler: error en actualización de servicios")


def _run_catchup(app: Flask):
    """Ejecuta catch-up al arrancar para recuperar días perdidos."""
    with app.app_context():
        from ..billing.engine import run_catchup
        from ..logging_utils import slog

        slog(
            module="SYSTEM",
            action="SCHEDULER_CATCHUP_START",
            message="Scheduler: iniciando catch-up de facturación al arrancar",
        )

        try:
            run_catchup(max_days_back=7)
        except Exception:
            logger.exception("Billing catch-up: error durante la recuperación")

        slog(
            module="SYSTEM",
            action="SCHEDULER_CATCHUP_END",
            message="Scheduler: catch-up de facturación finalizado",
        )


def _maybe_run_catchup(app: Flask):
    """Catch-up solo si el scheduler está habilitado en configuración."""
    with app.app_context():
        enabled, run_hour = _scheduler_config_from_db()
        if not enabled:
            logger.info(
                "Billing scheduler: catch-up omitido (activá el scheduler en Configuración > Cobranza)"
            )
            return
    logger.info(
        "Billing scheduler: ejecutando catch-up (hora UTC configurada: %02d:00)",
        run_hour,
    )
    _run_catchup(app)


def _scheduler_loop(app: Flask):
    """Loop principal: cada minuto relee BD; si está habilitado y corresponde, factura una vez por día."""
    last_run_date = None

    while True:
        try:
            with app.app_context():
                enabled, run_hour = _scheduler_config_from_db()
            if not enabled:
                time.sleep(60)
                continue

            now = datetime.utcnow()
            today = now.date()
            if now.hour >= run_hour and last_run_date != today:
                try:
                    _run_daily(app)
                    last_run_date = today
                except Exception:
                    logger.exception("Billing scheduler: error en ejecución diaria")
                    time.sleep(300)
                    continue
        except Exception:
            logger.exception("Billing scheduler: error en loop")
            time.sleep(60)
            continue

        time.sleep(60)


def start_billing_scheduler(app: Flask):
    """
    Inicia el scheduler en hilos daemon (mismo proceso que Gunicorn).
    Siempre arranca el loop: habilitar/deshabilitar se controla solo con settings en BD.
    """
    global _scheduler_started
    if _scheduler_started:
        return

    catchup_thread = threading.Thread(
        target=_maybe_run_catchup, args=(app,), daemon=True, name="billing-catchup"
    )
    catchup_thread.start()

    t = threading.Thread(
        target=_scheduler_loop, args=(app,), daemon=True, name="billing-scheduler"
    )
    t.start()

    _scheduler_started = True

    with app.app_context():
        from ..logging_utils import slog
        enabled, run_hour = _scheduler_config_from_db()
        slog(
            module="SYSTEM",
            action="SCHEDULER_STARTED",
            message=(
                "Hilo de scheduler de facturación iniciado "
                f"({'habilitado' if enabled else 'deshabilitado'} en BD; hora UTC si aplica: {run_hour:02d}:00)"
            ),
            details={
                "enabled_in_db": enabled,
                "run_hour_utc": run_hour,
                "catchup_days": 7 if enabled else 0,
            },
        )
