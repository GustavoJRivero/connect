from datetime import date

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from ..extensions import db
from ..billing.engine import run_billing, get_billing_mode, get_global_billing_day
from ..mikrotik.ros_client import MikrotikRosClient
from ..models.billing_run import BillingRun
from ..models.connection import Connection
from ..models.invoice import Invoice
from ..models.setting import Setting

bp = Blueprint("billing", __name__, url_prefix="/api/billing")


def _get_setting(key: str, default=None):
    s = Setting.query.get(key)
    return s.value if s else default


def _get_mt_from_app():
    from flask import current_app

    host = current_app.config.get("MIKROTIK_HOST")
    user = current_app.config.get("MIKROTIK_USER")
    password = current_app.config.get("MIKROTIK_PASS")
    port = current_app.config.get("MIKROTIK_PORT", 8728)

    if not host or not user or not password:
        return None
    return MikrotikRosClient(host=host, user=user, password=password, port=port)


@bp.post("/generate")
@jwt_required(optional=True)
def generate_monthly_invoices():
    """
    Genera facturas usando el motor centralizado.

    Body opcional:
    {
      "issue": true,
      "issue_date": "2026-01-31",
      "billing_day": 15,
      "force_all": false
    }
    """
    data = request.get_json(silent=True) or {}
    issue = bool(data.get("issue", False))
    issue_date = date.fromisoformat(data["issue_date"]) if data.get("issue_date") else date.today()
    force_all = bool(data.get("force_all", False))
    target_billing_day = data.get("billing_day")

    result = run_billing(
        billing_date=issue_date,
        issue=issue,
        force_all=force_all,
        target_billing_day=int(target_billing_day) if target_billing_day is not None else None,
        trigger="MANUAL",
    )

    return jsonify({
        "run_id": result["run_id"],
        "created": result["created"],
        "skipped": result["skipped"],
        "processed": result["processed"],
        "errors": result["errors"],
        "duration_ms": result["duration_ms"],
        "status": result["status"],
    })


@bp.get("/status")
@jwt_required(optional=True)
def billing_status():
    """
    Estado del sistema de facturación:
    - Últimas ejecuciones
    - Próximas facturaciones
    - Estado del scheduler
    """
    # Últimas 20 ejecuciones
    runs = (
        BillingRun.query
        .order_by(BillingRun.id.desc())
        .limit(20)
        .all()
    )

    runs_out = []
    for r in runs:
        runs_out.append({
            "id": r.id,
            "billing_date": r.billing_date.isoformat(),
            "trigger": r.trigger,
            "status": r.status,
            "connections_processed": r.connections_processed,
            "invoices_created": r.invoices_created,
            "invoices_skipped": r.invoices_skipped,
            "errors_count": r.errors_count,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "finished_at": r.finished_at.isoformat() if r.finished_at else None,
            "duration_ms": r.duration_ms,
        })

    # Conteo de conexiones por billing_day (próximas facturaciones)
    from sqlalchemy import func
    bd_counts = (
        db.session.query(Connection.billing_day, func.count(Connection.id))
        .filter(Connection.status == "ACTIVE")
        .group_by(Connection.billing_day)
        .order_by(Connection.billing_day.asc())
        .all()
    )

    schedule = [{"billing_day": bd, "active_connections": cnt} for bd, cnt in bd_counts]

    # Total conexiones activas
    total_active = Connection.query.filter_by(status="ACTIVE").count()

    # Modo de facturación
    mode = get_billing_mode()

    config = {
        "mode": mode,
        "global_day": get_global_billing_day() if mode == "GLOBAL" else None,
    }

    return jsonify({
        "config": config,
        "recent_runs": runs_out,
        "schedule": schedule,
        "total_active_connections": total_active,
    })


@bp.post("/enforce")
@jwt_required(optional=True)
def enforce_service_status():
    """
    Aplica reglas de corte/reconexión:
    - Si una conexión ACTIVE tiene alguna factura ISSUED vencida y no pagada -> cortar
    - Si una conexión CUT no tiene facturas vencidas impagas -> restaurar
    """
    today = date.today()
    cut_profile = (request.get_json(silent=True) or {}).get("cut_profile") or _get_setting("mikrotik.cut_profile", "CORTADO")

    mt = _get_mt_from_app()
    if not mt:
        return jsonify({"error": "mikrotik_not_configured"}), 502

    cut = []
    restored = []

    try:
        mt.connect()

        conns = Connection.query.all()
        for x in conns:
            overdue = (
                Invoice.query.filter_by(connection_id=x.id)
                .filter(Invoice.status.in_(["ISSUED"]))
                .filter(Invoice.due_date.isnot(None))
                .filter(Invoice.due_date < today)
                .filter(Invoice.paid_total < Invoice.total)
                .count()
                > 0
            )

            if x.status == "ACTIVE" and overdue:
                mt.set_pppoe_secret_profile(name=x.pppoe_name(), profile=cut_profile)
                x.status = "CUT"
                x.mikrotik_profile = cut_profile
                cut.append(int(x.id))

            if x.status == "CUT" and not overdue:
                mt.set_pppoe_secret_profile(name=x.pppoe_name(), profile=x.plan_profile)
                x.status = "ACTIVE"
                x.mikrotik_profile = x.plan_profile
                restored.append(int(x.id))

        db.session.commit()
    finally:
        mt.close()

    return jsonify({"cut": cut, "restored": restored})
