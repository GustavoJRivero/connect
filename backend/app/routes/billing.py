from datetime import date, timedelta
from decimal import Decimal

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from ..extensions import db
from ..logging_utils import slog
from ..models.client import Client
from ..models.connection import Connection
from ..models.invoice import Invoice
from ..models.plan import Plan
from ..models.setting import Setting
from ..models.billing_run import BillingRun

bp = Blueprint("billing", __name__, url_prefix="/api/billing")


def _get_setting(key: str, default=None):
    s = Setting.query.get(key)
    return s.value if s else default


def _issuer():
    return {
        "cuit": _get_setting("issuer.cuit", "30716906333"),
        "point_of_sale": int(_get_setting("issuer.point_of_sale", "2")),
    }


def _plan_price(profile: str) -> Decimal:
    """Lee el precio del plan desde la tabla plans (no desde settings)."""
    plan = Plan.query.filter_by(profile=profile).first()
    if not plan:
        raise KeyError(f"Plan no encontrado para profile '{profile}'")
    return Decimal(str(plan.price_with_iva))


def _default_invoice_type(client: Client) -> str:
    return "A" if client.kind == "COMPANY" else "B"


@bp.get("/status")
@jwt_required(optional=True)
def billing_status():
    """Estado general de facturación: modo, último run, stats."""
    mode = (_get_setting("billing.mode", "GLOBAL") or "GLOBAL").upper()
    try:
        global_day = max(1, min(28, int(_get_setting("billing.global_day", "1"))))
    except (ValueError, TypeError):
        global_day = 1
    due_days = int(_get_setting("billing.due_days", "10") or "10")

    today = date.today()
    active_connections = Connection.query.filter_by(status="ACTIVE").count()
    cut_connections = Connection.query.filter_by(status="CUT").count()
    overdue_invoices = (
        Invoice.query
        .filter(Invoice.status.in_(["ISSUED"]))
        .filter(Invoice.due_date.isnot(None))
        .filter(Invoice.due_date < today)
        .filter(Invoice.paid_total < Invoice.total)
        .count()
    )
    draft_invoices = Invoice.query.filter_by(status="DRAFT").count()

    last_run = BillingRun.query.order_by(BillingRun.created_at.desc()).first()
    last_run_data = None
    if last_run:
        last_run_data = {
            "id": last_run.id,
            "billing_date": str(last_run.billing_date),
            "trigger": last_run.trigger,
            "status": last_run.status,
            "invoices_created": last_run.invoices_created,
            "invoices_skipped": last_run.invoices_skipped,
            "errors_count": last_run.errors_count,
            "created_at": last_run.created_at.isoformat() if last_run.created_at else None,
        }

    return jsonify({
        "mode": mode,
        "global_day": global_day,
        "due_days": due_days,
        "active_connections": active_connections,
        "cut_connections": cut_connections,
        "overdue_invoices": overdue_invoices,
        "draft_invoices": draft_invoices,
        "last_run": last_run_data,
    })


@bp.post("/generate")
@jwt_required(optional=True)
def generate_monthly_invoices():
    """
    Genera facturas DRAFT (o ISSUED) para conexiones ACTIVE del mes indicado.

    Body opcional:
    {
      "issue": true,           // si true las deja ISSUED
      "issue_date": "2026-01-31"
    }
    """
    data = request.get_json(silent=True) or {}
    issue = bool(data.get("issue", False))
    issue_date = date.fromisoformat(data["issue_date"]) if data.get("issue_date") else date.today()
    due_days = int(_get_setting("billing.due_days", "10") or "10")
    due_date = issue_date + timedelta(days=due_days)

    issuer = _issuer()

    slog(
        module="BILLING",
        action="GENERATE_START",
        message=f"Inicio de generación de facturas para {issue_date.isoformat()}",
        details={"issue": issue, "issue_date": issue_date.isoformat(), "due_date": due_date.isoformat()},
    )

    created = 0
    skipped = 0
    errors = []

    conns = Connection.query.filter_by(status="ACTIVE").all()
    for x in conns:
        client = db.session.get(Client, x.client_id)
        if not client or not client.is_active:
            skipped += 1
            continue

        try:
            total = _plan_price(x.plan_profile)
        except Exception as e:
            errors.append({"connection_id": x.id, "error": str(e)})
            slog(
                module="BILLING",
                action="GENERATE_ERROR",
                message=f"Error al obtener precio para conexión #{x.id} (profile={x.plan_profile}): {e}",
                level="ERROR",
                details={"connection_id": x.id, "profile": x.plan_profile, "error": str(e)},
                ref_id=x.id,
                ref_type="connection",
            )
            continue

        plan = Plan.query.filter_by(profile=x.plan_profile).first()
        description = f"Servicio Internet - {plan.name}" if plan else f"Servicio Internet ({x.plan_profile})"

        inv = Invoice(
            client_id=client.id,
            connection_id=x.id,
            invoice_type=_default_invoice_type(client),
            issuer_cuit=str(issuer["cuit"]),
            point_of_sale=int(issuer["point_of_sale"]),
            issue_date=issue_date,
            due_date=due_date,
            total=total,
            status="ISSUED" if issue else "DRAFT",
            description=description,
        )
        db.session.add(inv)
        created += 1

    db.session.commit()

    slog(
        module="BILLING",
        action="GENERATE_COMPLETE",
        message=f"Generación completada: {created} creadas, {skipped} omitidas, {len(errors)} errores",
        details={
            "created": created,
            "skipped": skipped,
            "errors_count": len(errors),
            "issue_date": issue_date.isoformat(),
            "due_date": due_date.isoformat(),
        },
    )

    return jsonify({"created": created, "skipped": skipped, "errors": errors})


@bp.post("/update-services")
@jwt_required(optional=True)
def update_service_status():
    """
    Actualiza el estado de todos los servicios según deuda vencida.
    Corta los que deben y restaura los que ya pagaron.
    """
    data = request.get_json(silent=True) or {}
    cut_profile = data.get("cut_profile")

    slog(
        module="BILLING",
        action="UPDATE_SERVICES_START",
        message="Inicio de actualización de estado de servicios (manual)",
    )

    from ..billing.service_status import update_all_services
    result = update_all_services(cut_profile=cut_profile)

    slog(
        module="BILLING",
        action="UPDATE_SERVICES_COMPLETE",
        message=f"Actualización completada: {len(result.get('cut', []))} cortadas, {len(result.get('restored', []))} restauradas",
        details={
            "cut": result.get("cut", []),
            "restored": result.get("restored", []),
            "mt_errors": result.get("mt_errors", []),
        },
    )

    return jsonify(result)

