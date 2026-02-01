from datetime import date
from decimal import Decimal

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from ..extensions import db
from ..mikrotik.ros_client import MikrotikRosClient
from ..models.client import Client
from ..models.connection import Connection
from ..models.invoice import Invoice
from ..models.setting import Setting

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
    v = _get_setting(f"plan.price.{profile}", None)
    if v is None:
        raise KeyError(f"missing plan.price.{profile}")
    return Decimal(str(v))


def _default_invoice_type(client: Client) -> str:
    # regla simple: empresa -> A, persona -> B
    return "A" if client.kind == "COMPANY" else "B"


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

    issuer = _issuer()

    created = 0
    errors = []

    conns = Connection.query.filter_by(status="ACTIVE").all()
    for x in conns:
        client = Client.query.get(x.client_id)
        if not client or not client.is_active:
            continue

        try:
            total = _plan_price(x.plan_profile)
        except Exception as e:
            errors.append({"connection_id": x.id, "error": str(e)})
            continue

        inv = Invoice(
            client_id=client.id,
            connection_id=x.id,
            invoice_type=_default_invoice_type(client),
            issuer_cuit=str(issuer["cuit"]),
            point_of_sale=int(issuer["point_of_sale"]),
            issue_date=issue_date,
            total=total,
            status="ISSUED" if issue else "DRAFT",
        )
        db.session.add(inv)
        created += 1

    db.session.commit()
    return jsonify({"created": created, "errors": errors})


@bp.post("/enforce")
@jwt_required(optional=True)
def enforce_service_status():
    """
    Aplica reglas de corte/reconexión:
    - Si una conexión ACTIVE tiene alguna factura ISSUED vencida (due_date < today) y no pagada -> cortar (profile CORTADO)
    - Si una conexión CUT no tiene facturas vencidas impagas -> restaurar al plan
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

