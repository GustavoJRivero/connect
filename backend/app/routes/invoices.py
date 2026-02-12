from decimal import Decimal
from datetime import date, datetime, timedelta

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from ..extensions import db
from ..models.invoice import Invoice
from ..models.payment import PaymentAllocation
from ..models.setting import Setting
from ..models.user import User

bp = Blueprint("invoices", __name__, url_prefix="/api/invoices")


def _get_setting(key: str, default=None):
    s = Setting.query.get(key)
    return s.value if s else default


def _issuer():
    return {
        "cuit": _get_setting("issuer.cuit", "30716906333"),
        "point_of_sale": int(_get_setting("issuer.point_of_sale", "2")),
    }


def _next_cbte_number(*, point_of_sale: int, invoice_type: str) -> int:
    """
    Numeración interna simple por PV + tipo (A/B/X).
    Luego esto se reemplaza por el último número real consultado a AFIP.
    """
    key = f"invoice.next.{point_of_sale}.{invoice_type}"
    current = int(_get_setting(key, "1"))
    db.session.merge(Setting(key=key, value=str(current + 1)))
    return current


def _payment_status(x: Invoice) -> str:
    """
    Estado "de cobranza" calculado para UI.
    """
    if x.status == "PAID":
        return "PAID"
    if x.status == "VOID":
        return "VOID"
    if x.status == "DRAFT":
        return "DRAFT"
    if x.status == "ISSUED":
        try:
            total = Decimal(str(x.total))
            paid = Decimal(str(x.paid_total))
        except Exception:
            total = Decimal("0")
            paid = Decimal("0")
        if paid >= total and total > 0:
            return "PAID"
        if x.due_date and x.due_date < date.today():
            return "OVERDUE"
        return "UNPAID"
    return x.status


def _invoice_to_dict(x: Invoice) -> dict:
    u = User.query.get(int(x.deleted_by_user_id)) if getattr(x, "deleted_by_user_id", None) else None
    return {
        "id": x.id,
        "client_id": x.client_id,
        "connection_id": x.connection_id,
        "invoice_type": x.invoice_type,
        "issuer_cuit": x.issuer_cuit,
        "point_of_sale": x.point_of_sale,
        "cbte_number": x.cbte_number,
        "issue_date": x.issue_date.isoformat(),
        "due_date": x.due_date.isoformat() if x.due_date else None,
        "currency": x.currency,
        "total": str(x.total),
        "paid_total": str(x.paid_total),
        "status": x.status,
        "payment_status": _payment_status(x),
        "is_deleted": bool(getattr(x, "is_deleted", False)),
        "deleted_at": x.deleted_at.isoformat() if getattr(x, "deleted_at", None) else None,
        "deleted_by_user_id": getattr(x, "deleted_by_user_id", None),
        "deleted_by": {"id": u.id, "username": u.username} if u else None,
        "period_start": x.period_start.isoformat() if getattr(x, "period_start", None) else None,
        "period_end": x.period_end.isoformat() if getattr(x, "period_end", None) else None,
        "cae": x.cae,
        "cae_due_date": x.cae_due_date.isoformat() if x.cae_due_date else None,
    }


@bp.post("")
@jwt_required(optional=True)
def create_invoice_draft():
    """
    Crea una factura en estado DRAFT.

    Body:
    {
      "client_id": 1,
      "connection_id": 10,   // opcional
      "invoice_type": "A" | "B" | "X",
      "total": "1234.56"
    }
    """
    data = request.get_json(force=True) or {}
    client_id = data.get("client_id")
    if not client_id:
        return jsonify({"error": "client_id_required"}), 400

    invoice_type = (data.get("invoice_type") or "").upper().strip()
    if invoice_type not in ("A", "B", "X"):
        return jsonify({"error": "invalid_invoice_type"}), 400

    total_raw = data.get("total")
    if total_raw is None:
        return jsonify({"error": "total_required"}), 400

    try:
        total = Decimal(str(total_raw))
    except Exception:
        return jsonify({"error": "invalid_total"}), 400

    issuer = _issuer()

    x = Invoice(
        client_id=int(client_id),
        connection_id=(int(data["connection_id"]) if data.get("connection_id") else None),
        invoice_type=invoice_type,
        issuer_cuit=str(issuer["cuit"]),
        point_of_sale=int(issuer["point_of_sale"]),
        total=total,
        status="DRAFT",
    )

    db.session.add(x)
    db.session.commit()
    return jsonify(_invoice_to_dict(x)), 201


@bp.post("/<int:invoice_id>/issue")
@jwt_required(optional=True)
def issue_invoice(invoice_id: int):
    """
    Emite la factura:
    - asigna numeración (cbte_number)
    - marca ISSUED

    Por ahora NO llama a AFIP: queda la estructura lista para luego.
    """
    x = Invoice.query.get_or_404(invoice_id)
    if getattr(x, "is_deleted", False):
        return jsonify({"error": "invoice_deleted"}), 409
    if x.status != "DRAFT":
        return jsonify({"error": "invalid_status"}), 409

    cbte = _next_cbte_number(point_of_sale=x.point_of_sale, invoice_type=x.invoice_type)
    x.cbte_number = cbte
    x.status = "ISSUED"
    if not x.due_date:
        due_days = int(_get_setting("billing.due_days", "10"))
        x.due_date = date.today() + timedelta(days=due_days)

    db.session.commit()
    return jsonify(_invoice_to_dict(x))


@bp.get("")
@jwt_required(optional=True)
def list_invoices():
    client_id = request.args.get("client_id")
    include_deleted = request.args.get("include_deleted", "false").lower() == "true"
    q = Invoice.query
    if client_id:
        q = q.filter_by(client_id=int(client_id))
    if not include_deleted:
        q = q.filter(Invoice.is_deleted.is_(False))
    items = q.order_by(Invoice.id.desc()).limit(500).all()
    return jsonify([_invoice_to_dict(x) for x in items])


@bp.delete("/<int:invoice_id>")
@jwt_required(optional=True)
def delete_invoice(invoice_id: int):
    """
    Baja lógica de una factura (solo si no tiene pagos imputados).
    """
    x = Invoice.query.get_or_404(invoice_id)
    if getattr(x, "is_deleted", False):
        return jsonify(_invoice_to_dict(x))
    has_alloc = PaymentAllocation.query.filter_by(invoice_id=x.id).count() > 0
    try:
        paid_total = Decimal(str(x.paid_total))
    except Exception:
        paid_total = Decimal("0")
    if has_alloc or paid_total > 0:
        return jsonify({"error": "invoice_has_payments"}), 409

    ident = get_jwt_identity()
    deleted_by_user_id = None
    if ident:
        try:
            deleted_by_user_id = int(ident)
        except Exception:
            deleted_by_user_id = None

    x.is_deleted = True
    x.deleted_at = datetime.utcnow()
    x.deleted_by_user_id = deleted_by_user_id
    x.status = "VOID"
    db.session.commit()
    return jsonify(_invoice_to_dict(x))

