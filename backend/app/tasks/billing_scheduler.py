"""
Scheduler de facturación automática.

Estrategia de robustez:
1. Al iniciar, ejecuta catch-up para los últimos 7 días (recupera caídas)
2. Cada día a la hora configurada, ejecuta la facturación del día
3. Usa BillingRun como registro → idempotente (no duplica)
4. Errores por conexión se aíslan (no frenan el lote)
5. Commits por lote de 50 (no se pierde todo si falla a mitad)
"""
import threading
import time
import logging
from datetime import date, datetime

from flask import Flask

logger = logging.getLogger(__name__)

_scheduler_started = False


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

        # Actualizar estado de servicios después de facturar
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


def _scheduler_loop(app: Flask, run_hour: int):
    """
    Loop principal. Espera hasta la hora configurada y ejecuta.
    """
    last_run_date = None

    while True:
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

        time.sleep(60)


def start_billing_scheduler(app: Flask):
    """Inicia el scheduler de facturación en un thread daemon."""
    global _scheduler_started
    if _scheduler_started:
        return
    if str(app.config.get("BILLING_SCHEDULER_ENABLED", "true")).lower() in ("0", "false", "no"):
        return

    run_hour = int(app.config.get("BILLING_SCHEDULER_HOUR", 6))

    # 1. Catch-up al arrancar
    catchup_thread = threading.Thread(
        target=_run_catchup, args=(app,), daemon=True, name="billing-catchup"
    )
    catchup_thread.start()

    # 2. Scheduler diario
    t = threading.Thread(
        target=_scheduler_loop, args=(app, run_hour), daemon=True, name="billing-scheduler"
    )
    t.start()

    _scheduler_started = True

    with app.app_context():
        from ..logging_utils import slog
        slog(
            module="SYSTEM",
            action="SCHEDULER_STARTED",
            message=f"Scheduler de facturación iniciado (hora UTC: {run_hour:02d}:00)",
            details={"run_hour_utc": run_hour, "catchup_days": 7},
        )
