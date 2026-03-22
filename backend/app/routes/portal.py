"""
Portal de clientes — endpoints exclusivos para usuarios con role=CLIENT.

Endpoints:
  GET  /api/portal/me          → datos del cliente + conexiones
  GET  /api/portal/invoices    → facturas del cliente (ISSUED/PAID)
  POST /api/portal/pay         → crear preferencia MP para pagar facturas
"""
import logging
from decimal import Decimal
from functools import wraps

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from ..extensions import db
from ..models.client import Client
from ..models.connection import Connection
from ..models.invoice import Invoice
from ..models.mikrotik_server import MikrotikServer
from ..models.user import User

logger = logging.getLogger(__name__)

bp = Blueprint("portal", __name__, url_prefix="/api/portal")


# ---------------------------------------------------------------------------
# Guard: solo usuarios CLIENT
# ---------------------------------------------------------------------------

def client_required(fn):
    """Decorador que exige role=CLIENT y que el usuario tenga client_id."""
    @wraps(fn)
    @jwt_required()
    def wrapper(*args, **kwargs):
        user_id = get_jwt_identity()
        user = User.query.get(int(user_id))
        if not user or user.role != "CLIENT" or not user.client_id:
            return jsonify({"error": "forbidden"}), 403
        return fn(*args, **kwargs)
    return wrapper


def _current_user() -> User:
    return User.query.get(int(get_jwt_identity()))


# ---------------------------------------------------------------------------
# GET /api/portal/me
# ---------------------------------------------------------------------------

@bp.get("/me")
@client_required
def portal_me():
    """Devuelve los datos del cliente logueado + sus conexiones."""
    user = _current_user()
    client = Client.query.get(user.client_id)
    if not client:
        return jsonify({"error": "client_not_found"}), 404

    server_ids = {int(x.server_id) for x in client.connections if getattr(x, "server_id", None)}
    server_map = {}
    if server_ids:
        rows = MikrotikServer.query.filter(MikrotikServer.id.in_(server_ids)).all()
        server_map = {int(s.id): s.name for s in rows}

    connections_out = []
    for x in client.connections:
        sid = int(x.server_id) if getattr(x, "server_id", None) else None
        connections_out.append({
            "id": x.id,
            "plan_profile": x.plan_profile,
            "status": x.status,
            "service_address": x.service_address,
            "server_name": server_map.get(sid) if sid else None,
            "last_connected_at": x.last_connected_at.isoformat() if x.last_connected_at else None,
        })

    return jsonify({
        "id": client.id,
        "full_name": client.full_name,
        "email": client.email,
        "phone": client.phone,
        "address": client.address,
        "status": getattr(client, "status", "ACTIVE"),
        "connections": connections_out,
    })


# ---------------------------------------------------------------------------
# GET /api/portal/invoices
# ---------------------------------------------------------------------------

@bp.get("/invoices")
@client_required
def portal_invoices():
    """Devuelve las facturas del cliente. Incluye pendientes y las últimas 12 pagadas."""
    user = _current_user()

    pending = (
        Invoice.query
        .filter_by(client_id=user.client_id)
        .filter(Invoice.is_deleted.is_(False))
        .filter(Invoice.status.in_(["ISSUED", "DRAFT"]))
        .order_by(Invoice.issue_date.asc(), Invoice.id.asc())
        .all()
    )

    paid = (
        Invoice.query
        .filter_by(client_id=user.client_id)
        .filter(Invoice.is_deleted.is_(False))
        .filter(Invoice.status == "PAID")
        .order_by(Invoice.issue_date.desc(), Invoice.id.desc())
        .limit(12)
        .all()
    )

    def to_dict(inv: Invoice) -> dict:
        total = Decimal(str(inv.total))
        paid_total = Decimal(str(inv.paid_total))
        balance = max(Decimal("0"), total - paid_total)
        return {
            "id": inv.id,
            "status": inv.status,
            "total": str(total),
            "paid_total": str(paid_total),
            "balance": str(balance),
            "issue_date": inv.issue_date.isoformat() if inv.issue_date else None,
            "due_date": inv.due_date.isoformat() if inv.due_date else None,
            "description": inv.description,
            "period_start": inv.period_start.isoformat() if inv.period_start else None,
            "period_end": inv.period_end.isoformat() if inv.period_end else None,
        }

    return jsonify({
        "pending": [to_dict(inv) for inv in pending],
        "paid": [to_dict(inv) for inv in paid],
    })


# ---------------------------------------------------------------------------
# POST /api/portal/pay
# ---------------------------------------------------------------------------

@bp.post("/pay")
@client_required
def portal_pay():
    """
    Crea una preferencia de pago en Mercado Pago para las facturas indicadas.

    Body:
    {
      "invoice_ids": [10, 11]   // IDs de facturas del cliente a pagar
    }

    Response 201:
    {
      "init_point": "https://www.mercadopago.com.ar/...",
      "preference_id": "...",
      "mp_preference_id": 42
    }
    """
    user = _current_user()
    data = request.get_json(force=True) or {}
    invoice_ids = data.get("invoice_ids")

    if not invoice_ids or not isinstance(invoice_ids, list):
        return jsonify({"error": "invoice_ids_required"}), 400

    # Reutiliza la lógica de create_preference del módulo mercadopago
    # pero fuerza client_id = el del usuario logueado (no puede pagar facturas de otro)
    from .mercadopago import create_preference as _create_preference

    # Inyectamos el client_id correcto en el request
    with db.session.no_autoflush:
        # Llamamos directamente a la lógica interna reutilizando el módulo MP
        from ..mercadopago.client import get_mp_client
        from ..models.mp_preference import MpPreference
        import os

        client = Client.query.get(user.client_id)
        if not client:
            return jsonify({"error": "client_not_found"}), 404

        invoice_ids_int = [int(x) for x in invoice_ids]
        invoices = (
            Invoice.query
            .filter(Invoice.id.in_(invoice_ids_int))
            .filter(Invoice.client_id == user.client_id)
            .filter(Invoice.is_deleted.is_(False))
            .filter(Invoice.status.in_(["ISSUED", "DRAFT"]))
            .all()
        )
        if len(invoices) != len(invoice_ids_int):
            found_ids = {int(inv.id) for inv in invoices}
            missing = [x for x in invoice_ids_int if x not in found_ids]
            return jsonify({"error": "invoice_not_found", "invoice_ids": missing}), 404

        total = sum(
            max(Decimal("0"), Decimal(str(inv.total)) - Decimal(str(inv.paid_total)))
            for inv in invoices
        )
        if total <= 0:
            return jsonify({"error": "invoices_already_paid"}), 409

        nums = ", ".join(str(inv.cbte_number or inv.id) for inv in invoices)
        title = f"Facturas {nums}" if len(invoices) > 1 else f"Factura {nums}"

        pref_record = MpPreference(
            client_id=user.client_id,
            total=total,
            status="PENDING",
        )
        pref_record.invoice_ids = invoice_ids_int
        db.session.add(pref_record)
        db.session.flush()

        base = os.environ.get("FRONTEND_URL", "http://localhost:3000")
        backend = os.environ.get("BACKEND_URL", "http://localhost:5001")

        try:
            mp = get_mp_client()
            mp_response = mp.create_preference(
                title=title,
                quantity=1,
                unit_price=float(total),
                external_reference=str(pref_record.id),
                back_url_success=f"{base}/payment/success?pref={pref_record.id}",
                back_url_pending=f"{base}/payment/pending?pref={pref_record.id}",
                back_url_failure=f"{base}/payment/failure?pref={pref_record.id}",
                notification_url=f"{backend}/api/mercadopago/webhook",
                payer_email=getattr(client, "email", None) or None,
            )
        except Exception as exc:
            db.session.rollback()
            logger.exception("Error creando preferencia MP portal para cliente #%s", user.client_id)
            return jsonify({"error": "mp_error", "detail": str(exc)}), 502

        pref_record.preference_id = mp_response["id"]
        db.session.commit()

        return jsonify({
            "init_point": mp_response.get("init_point"),
            "sandbox_init_point": mp_response.get("sandbox_init_point"),
            "preference_id": mp_response["id"],
            "mp_preference_id": pref_record.id,
        }), 201
