"""
Motor de facturación centralizado.

Modos de facturación (setting `billing.mode`):
- GLOBAL: todas las conexiones se facturan el mismo día (setting `billing.global_day`)
- INDIVIDUAL: cada conexión tiene su propio billing_day

Garantías:
- Idempotente: no genera duplicados (verifica período + conexión)
- Aislamiento de errores: una conexión que falla no frena las demás
- Commits por lote: cada BATCH_SIZE conexiones se commitean
- Auditoría: cada ejecución queda registrada en BillingRun + SystemLog
"""
import json
import calendar
import logging
import time
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from ..extensions import db
from ..logging_utils import slog
from ..models.billing_run import BillingRun
from ..models.client import Client
from ..models.connection import Connection
from ..models.invoice import Invoice
from ..models.plan import Plan
from ..models.setting import Setting

logger = logging.getLogger(__name__)

BATCH_SIZE = 50


# ---------------------------------------------------------------------------
# Helpers de configuración
# ---------------------------------------------------------------------------

def _get_setting(key: str, default=None):
    s = Setting.query.get(key)
    return s.value if s else default


def get_billing_mode() -> str:
    """Retorna 'GLOBAL' o 'INDIVIDUAL'."""
    return (_get_setting("billing.mode", "GLOBAL") or "GLOBAL").upper()


def get_global_billing_day() -> int:
    """Retorna el día global de facturación (1-28). Default: 1."""
    try:
        return max(1, min(28, int(_get_setting("billing.global_day", "1"))))
    except (ValueError, TypeError):
        return 1


def effective_billing_day(conn: Connection) -> int:
    """Retorna el billing_day efectivo según el modo configurado."""
    mode = get_billing_mode()
    if mode == "INDIVIDUAL":
        return conn.billing_day or 1
    return get_global_billing_day()


def _issuer():
    return {
        "cuit": _get_setting("issuer.cuit", "30716906333"),
        "point_of_sale": int(_get_setting("issuer.point_of_sale", "2")),
    }


def _plan_price(conn: Connection) -> Decimal:
    """
    Obtiene el precio del plan para una conexión.
    Busca primero por plan_id (FK), luego por profile name como fallback.
    Retorna el precio con IVA incluido.
    """
    plan = None
    if conn.plan_id:
        plan = Plan.query.get(conn.plan_id)
    if not plan:
        plan = Plan.query.filter_by(profile=conn.plan_profile).first()
    if not plan:
        # Fallback a settings legacy
        v = _get_setting(f"plan.price.{conn.plan_profile}", None)
        if v is None:
            raise KeyError(f"No existe plan '{conn.plan_profile}'. Crealo en Configuración > Planes.")
        return Decimal(str(v))
    return plan.price_with_iva


def _default_invoice_type(client: Client) -> str:
    return "A" if client.kind == "COMPANY" else "B"


# ---------------------------------------------------------------------------
# Helpers de período
# ---------------------------------------------------------------------------

def billing_day_for_month(billing_day: int, year: int, month: int) -> int:
    """Devuelve el billing_day real limitado a los días del mes."""
    max_day = calendar.monthrange(year, month)[1]
    return min(billing_day, max_day)


def period_for_billing_day(bd: int, ref_date: date):
    """
    Calcula el período de facturación dado un billing_day y una fecha de referencia.
    El período va del billing_day del mes anterior al billing_day - 1 del mes actual.
    Ej: bd=15, ref_date=2026-02-15 → período 15/01 al 14/02.
    """
    y, m = ref_date.year, ref_date.month

    if m == 1:
        prev_y, prev_m = y - 1, 12
    else:
        prev_y, prev_m = y, m - 1

    period_start_day = billing_day_for_month(bd, prev_y, prev_m)
    period_start_date = date(prev_y, prev_m, period_start_day)

    period_end_day = billing_day_for_month(bd, y, m)
    period_end_date = date(y, m, period_end_day) - timedelta(days=1)

    return period_start_date, period_end_date


def is_first_billing_cycle(conn: Connection, period_start: date) -> bool:
    """Determina si es el primer ciclo de facturación de la conexión."""
    return conn.created_at.date() >= period_start


def prorate_amount(full_price: Decimal, period_start: date, period_end: date, start_date: date) -> Decimal:
    """Calcula el monto prorrateado proporcionalmente."""
    total_days = (period_end - period_start).days + 1
    used_days = (period_end - start_date).days + 1
    if used_days <= 0:
        return Decimal("0")
    if used_days >= total_days:
        return full_price
    return (full_price * Decimal(str(used_days)) / Decimal(str(total_days))).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )


def already_billed(connection_id: int, period_start: date, period_end: date) -> bool:
    """Verifica si ya existe una factura (no eliminada) para esta conexión y período."""
    return (
        Invoice.query.filter_by(connection_id=connection_id)
        .filter(Invoice.is_deleted.is_(False))
        .filter(Invoice.period_start == period_start)
        .filter(Invoice.period_end == period_end)
        .count()
        > 0
    )


# ---------------------------------------------------------------------------
# Verificación: ¿hay algo para facturar en una fecha dada?
# ---------------------------------------------------------------------------

def has_billing_for_date(check_date: date) -> bool:
    """
    Determina si hay conexiones activas que deberían facturarse en check_date.
    Usa el modo configurado (GLOBAL o INDIVIDUAL).
    """
    mode = get_billing_mode()

    if mode == "GLOBAL":
        gbd = get_global_billing_day()
        expected = billing_day_for_month(gbd, check_date.year, check_date.month)
        if check_date.day != expected:
            return False
        return Connection.query.filter_by(status="ACTIVE").count() > 0

    conns = Connection.query.filter_by(status="ACTIVE").all()
    for x in conns:
        bd = x.billing_day or 1
        expected = billing_day_for_month(bd, check_date.year, check_date.month)
        if check_date.day == expected:
            return True
    return False


# ---------------------------------------------------------------------------
# Motor principal
# ---------------------------------------------------------------------------

def run_billing(
    *,
    billing_date: date,
    issue: bool = False,
    force_all: bool = False,
    target_billing_day: Optional[int] = None,
    trigger: str = "MANUAL",
) -> dict:
    """
    Ejecuta un ciclo de facturación.

    En modo GLOBAL: todas las conexiones se facturan si billing_date.day == global_day.
    En modo INDIVIDUAL: cada conexión se factura si billing_date.day == su billing_day.
    force_all: ignora el filtro de día y factura todo.
    """
    start_time = time.monotonic()
    now = datetime.utcnow()
    mode = get_billing_mode()

    # ── LOG: Inicio del proceso ──
    slog(
        module="BILLING",
        action="RUN_START",
        message=f"Iniciando proceso de facturación",
        details={
            "billing_date": billing_date.isoformat(),
            "mode": mode,
            "trigger": trigger,
            "issue": issue,
            "force_all": force_all,
            "target_billing_day": target_billing_day,
        },
    )

    # 1. Crear registro de auditoría
    run = BillingRun(
        created_at=now,
        billing_date=billing_date,
        trigger=trigger,
        status="RUNNING",
        started_at=now,
    )
    db.session.add(run)
    db.session.commit()

    issuer = _issuer()
    due_days = int(_get_setting("billing.due_days", "10"))

    created = 0
    skipped = 0
    processed = 0
    errors = []
    pending_count = 0

    try:
        conns = Connection.query.filter_by(status="ACTIVE").all()
        total_active = len(conns)

        slog(
            module="BILLING",
            action="CONNECTIONS_LOADED",
            message=f"Conexiones activas cargadas para evaluar",
            details={"total_active": total_active, "billing_date": billing_date.isoformat()},
            ref_id=run.id,
            ref_type="billing_run",
        )

        for x in conns:
            bd = effective_billing_day(x)

            # Filtrar por billing_day
            if not force_all:
                if target_billing_day is not None:
                    if bd != int(target_billing_day):
                        continue
                else:
                    expected_day = billing_day_for_month(bd, billing_date.year, billing_date.month)
                    if billing_date.day != expected_day:
                        continue

            processed += 1

            try:
                client = Client.query.get(x.client_id)
                if not client or not client.is_active:
                    slog(
                        module="BILLING",
                        action="CONNECTION_SKIPPED",
                        message=f"Conexión #{x.id} omitida: cliente inactivo o inexistente",
                        level="WARNING",
                        details={"connection_id": x.id, "client_id": x.client_id},
                        ref_id=x.id,
                        ref_type="connection",
                    )
                    continue

                period_start, period_end = period_for_billing_day(bd, billing_date)

                if already_billed(x.id, period_start, period_end):
                    skipped += 1
                    slog(
                        module="BILLING",
                        action="INVOICE_SKIPPED",
                        message=f"Factura ya existente para conexión #{x.id}, período {period_start}/{period_end}",
                        level="DEBUG",
                        details={
                            "connection_id": x.id,
                            "client_id": client.id,
                            "period_start": period_start.isoformat(),
                            "period_end": period_end.isoformat(),
                        },
                        ref_id=x.id,
                        ref_type="connection",
                    )
                    continue

                full_price = _plan_price(x)

                total = full_price
                is_first = is_first_billing_cycle(x, period_start)
                actual_start = period_start
                prorated = False

                if is_first and x.prorate_first_month:
                    actual_start = x.created_at.date()
                    total = prorate_amount(full_price, period_start, period_end, actual_start)
                    prorated = True
                    if total <= 0:
                        slog(
                            module="BILLING",
                            action="INVOICE_SKIPPED",
                            message=f"Prorrateo = $0 para conexión #{x.id}, omitida",
                            details={
                                "connection_id": x.id,
                                "client_id": client.id,
                                "full_price": str(full_price),
                                "actual_start": actual_start.isoformat(),
                            },
                            ref_id=x.id,
                            ref_type="connection",
                        )
                        continue
                elif is_first and not x.prorate_first_month:
                    actual_start = x.created_at.date()

                inv = Invoice(
                    client_id=client.id,
                    connection_id=x.id,
                    invoice_type=_default_invoice_type(client),
                    issuer_cuit=str(issuer["cuit"]),
                    point_of_sale=int(issuer["point_of_sale"]),
                    issue_date=billing_date,
                    due_date=billing_date + timedelta(days=due_days) if issue else None,
                    total=total,
                    period_start=actual_start if is_first else period_start,
                    period_end=period_end,
                    status="ISSUED" if issue else "DRAFT",
                )
                db.session.add(inv)
                created += 1
                pending_count += 1

                # ── LOG: Factura creada ──
                slog(
                    module="BILLING",
                    action="INVOICE_CREATED",
                    message=f"Factura generada para {client.full_name} (conexión #{x.id})",
                    details={
                        "connection_id": x.id,
                        "client_id": client.id,
                        "client_name": client.full_name,
                        "plan": x.plan_profile,
                        "total": str(total),
                        "full_price": str(full_price),
                        "prorated": prorated,
                        "period": f"{period_start.isoformat()}/{period_end.isoformat()}",
                        "status": "ISSUED" if issue else "DRAFT",
                        "billing_day": bd,
                    },
                    ref_id=x.id,
                    ref_type="connection",
                )

                if pending_count >= BATCH_SIZE:
                    db.session.commit()
                    slog(
                        module="BILLING",
                        action="BATCH_COMMITTED",
                        message=f"Lote de {BATCH_SIZE} facturas commiteado",
                        level="DEBUG",
                        details={"batch_size": BATCH_SIZE, "total_created_so_far": created},
                        ref_id=run.id,
                        ref_type="billing_run",
                    )
                    pending_count = 0

            except Exception as e:
                error_msg = f"connection_id={x.id}: {type(e).__name__}: {e}"
                errors.append({"connection_id": x.id, "error": str(e)})
                db.session.rollback()
                pending_count = 0

                # ── LOG: Error en conexión ──
                slog(
                    module="BILLING",
                    action="CONNECTION_ERROR",
                    message=f"Error procesando conexión #{x.id}: {e}",
                    level="ERROR",
                    details={
                        "connection_id": x.id,
                        "error_type": type(e).__name__,
                        "error_detail": str(e),
                    },
                    ref_id=x.id,
                    ref_type="connection",
                )

        if pending_count > 0:
            db.session.commit()

        # 2. Actualizar registro de auditoría
        elapsed_ms = int((time.monotonic() - start_time) * 1000)
        run.status = "COMPLETED"
        run.finished_at = datetime.utcnow()
        run.duration_ms = elapsed_ms
        run.connections_processed = processed
        run.invoices_created = created
        run.invoices_skipped = skipped
        run.errors_count = len(errors)
        run.errors_detail = json.dumps(errors, ensure_ascii=False) if errors else None
        db.session.commit()

        # ── LOG: Proceso completado ──
        slog(
            module="BILLING",
            action="RUN_COMPLETE",
            message=f"Facturación completada",
            details={
                "run_id": run.id,
                "billing_date": billing_date.isoformat(),
                "mode": mode,
                "trigger": trigger,
                "total_active": total_active,
                "processed": processed,
                "created": created,
                "skipped": skipped,
                "errors": len(errors),
                "duration_ms": elapsed_ms,
            },
            ref_id=run.id,
            ref_type="billing_run",
        )

    except Exception as e:
        logger.exception("BillingRun FAILED: %s", e)

        # ── LOG: Fallo catastrófico ──
        slog(
            module="BILLING",
            action="RUN_FAILED",
            message=f"Facturación falló: {e}",
            level="ERROR",
            details={
                "run_id": run.id,
                "billing_date": billing_date.isoformat(),
                "trigger": trigger,
                "error_type": type(e).__name__,
                "error_detail": str(e),
                "created_before_fail": created,
                "processed_before_fail": processed,
            },
            ref_id=run.id,
            ref_type="billing_run",
        )

        try:
            elapsed_ms = int((time.monotonic() - start_time) * 1000)
            run.status = "FAILED"
            run.finished_at = datetime.utcnow()
            run.duration_ms = elapsed_ms
            run.connections_processed = processed
            run.invoices_created = created
            run.invoices_skipped = skipped
            run.errors_count = len(errors) + 1
            run.errors_detail = json.dumps(errors + [{"fatal": str(e)}], ensure_ascii=False)
            db.session.commit()
        except Exception:
            logger.exception("No se pudo actualizar BillingRun tras fallo")

    return {
        "run_id": run.id,
        "created": created,
        "skipped": skipped,
        "processed": processed,
        "errors": errors,
        "duration_ms": run.duration_ms,
        "status": run.status,
    }


# ---------------------------------------------------------------------------
# Catch-up: detectar y ejecutar días perdidos
# ---------------------------------------------------------------------------

def run_catchup(max_days_back: int = 7):
    """
    Revisa los últimos `max_days_back` días y ejecuta la facturación
    para cualquier día que no tenga un BillingRun COMPLETED.
    """
    today = date.today()

    slog(
        module="BILLING",
        action="CATCHUP_START",
        message=f"Iniciando catch-up de facturación",
        details={"max_days_back": max_days_back, "today": today.isoformat()},
    )

    catchup_count = 0

    for days_ago in range(max_days_back, 0, -1):
        check_date = today - timedelta(days=days_ago)

        existing = (
            BillingRun.query
            .filter_by(billing_date=check_date, status="COMPLETED")
            .first()
        )
        if existing:
            continue

        if not has_billing_for_date(check_date):
            continue

        slog(
            module="BILLING",
            action="CATCHUP_DAY",
            message=f"Catch-up: ejecutando facturación pendiente para {check_date.isoformat()}",
            details={"check_date": check_date.isoformat(), "days_ago": days_ago},
        )

        result = run_billing(
            billing_date=check_date,
            issue=True,
            trigger="CATCHUP",
        )
        catchup_count += 1

    # También verificar hoy
    existing_today = (
        BillingRun.query
        .filter_by(billing_date=today, status="COMPLETED")
        .first()
    )
    if not existing_today and has_billing_for_date(today):
        slog(
            module="BILLING",
            action="CATCHUP_DAY",
            message=f"Catch-up: ejecutando facturación para hoy {today.isoformat()}",
            details={"check_date": today.isoformat(), "days_ago": 0},
        )
        run_billing(billing_date=today, issue=True, trigger="CATCHUP")
        catchup_count += 1

    slog(
        module="BILLING",
        action="CATCHUP_COMPLETE",
        message=f"Catch-up finalizado",
        details={"days_recovered": catchup_count},
    )
