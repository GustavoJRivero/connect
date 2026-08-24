"""
Scheduler de facturación automática.

La activación y la hora se configuran en Configuración (settings en BD):
  billing.scheduler.enabled  — generación automática de facturas ("true" / "false")
  billing.scheduler.run_hour — 0-23 (hora local de la app, según APP_TIMEZONE)
  billing.services.enabled   — actualización automática de cortes/restauraciones
                              (si no existe, hereda billing.scheduler.enabled)

Estrategia:
1. Si está habilitado al arrancar, ejecuta catch-up para los últimos 7 días
2. Cada minuto relee la configuración; si está habilitado y ya pasó la hora local del día, ejecuta facturación
3. Usa BillingRun como registro → idempotente
"""
import threading
import time
import logging
from datetime import date, datetime

from flask import Flask

from ..timezone import now_local, today_local

logger = logging.getLogger(__name__)

_scheduler_started = False


def _flag(raw: str) -> bool:
    return raw.lower() in ("1", "true", "yes", "on")


def _scheduler_config_from_db() -> tuple[bool, bool, int]:
    """Lee billing.scheduler.* y billing.services.enabled desde settings."""
    from ..models.setting import Setting

    def _get(key: str, default: str | None = "") -> str | None:
        s = Setting.query.get(key)
        if s is None or s.value is None:
            return default
        value = str(s.value).strip()
        return value if value else default

    billing_enabled = _flag(_get("billing.scheduler.enabled", "false") or "false")
    services_raw = _get("billing.services.enabled", None)
    services_enabled = _flag(services_raw) if services_raw is not None else billing_enabled
    try:
        hour = int(_get("billing.scheduler.run_hour", "6") or "6")
    except ValueError:
        hour = 6
    hour = max(0, min(23, hour))
    return billing_enabled, services_enabled, hour


def _run_daily(app: Flask):
    """Ejecuta facturación y/o actualización de servicios según la config del día."""
    with app.app_context():
        from ..logging_utils import slog
        from ..models.billing_run import BillingRun

        billing_enabled, services_enabled, _hour = _scheduler_config_from_db()
        today = today_local()

        if billing_enabled:
            existing = (
                BillingRun.query
                .filter_by(billing_date=today, status="COMPLETED")
                .first()
            )
            if existing:
                logger.debug("Billing scheduler: facturación ya ejecutada hoy (run #%d)", existing.id)
            else:
                from ..billing.engine import run_billing

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

        if services_enabled:
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
        billing_enabled, services_enabled, run_hour = _scheduler_config_from_db()
        if not billing_enabled and not services_enabled:
            logger.info(
                "Billing scheduler: catch-up omitido (activá generación o servicios en Configuración)"
            )
            return
        if billing_enabled:
            logger.info(
                "Billing scheduler: ejecutando catch-up (hora local configurada: %02d:00)",
                run_hour,
            )
        else:
            logger.info("Billing scheduler: catch-up de facturas omitido (solo servicios automático)")
    if billing_enabled:
        _run_catchup(app)
    if services_enabled:
        with app.app_context():
            try:
                from ..billing.service_status import update_all_services
                update_all_services()
            except Exception:
                logger.exception("Billing scheduler: error en actualización de servicios al arrancar")


def _scheduler_loop(app: Flask):
    """Loop principal: cada minuto relee BD; si está habilitado y corresponde, factura una vez por día."""
    last_run_date = None

    while True:
        try:
            with app.app_context():
                billing_enabled, services_enabled, run_hour = _scheduler_config_from_db()
            if not billing_enabled and not services_enabled:
                time.sleep(60)
                continue

            now = now_local()
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
        billing_enabled, services_enabled, run_hour = _scheduler_config_from_db()
        slog(
            module="SYSTEM",
            action="SCHEDULER_STARTED",
            message=(
                "Hilo de scheduler de facturación iniciado "
                f"(facturas={'on' if billing_enabled else 'off'}, "
                f"servicios={'on' if services_enabled else 'off'}; hora local: {run_hour:02d}:00)"
            ),
            details={
                "billing_enabled": billing_enabled,
                "services_enabled": services_enabled,
                "run_hour": run_hour,
                "catchup_days": 7 if billing_enabled else 0,
            },
        )
