import logging
from decimal import Decimal
from datetime import date

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from ..extensions import db
from ..billing.allocate import allocate_payment, apply_client_credit
from ..models.invoice import Invoice
from ..models.payment import Payment, PaymentAllocation
from ..models.user import User
from ..timezone import iso_utc, today_local

logger = logging.getLogger(__name__)

bp = Blueprint("payments", __name__, url_prefix="/api/payments")


def _payment_to_dict(p: Payment) -> dict:
    allocs = PaymentAllocation.query.filter_by(payment_id=p.id).all()
    u = User.query.get(int(p.created_by_user_id)) if getattr(p, "created_by_user_id", None) else None
    from ..models.client import Client
    client = Client.query.get(int(p.client_id)) if p.client_id else None
    return {
        "id": p.id,
        "client_id": p.client_id,
        "client_name": (client.full_name if client else None),
        "paid_at": p.paid_at.isoformat() if getattr(p, "paid_at", None) else None,
        "amount": str(p.amount),
        "method": p.method,
        "reference": p.reference,
        "note": p.note,
        "created_by_user_id": getattr(p, "created_by_user_id", None),
        "created_by": {"id": u.id, "username": u.username} if u else None,
        "created_at": iso_utc(p.created_at),
        "allocations": [{"invoice_id": a.invoice_id, "amount": str(a.amount)} for a in allocs],
    }


@bp.post("")
@jwt_required(optional=True)
def create_payment():
    """
    Registra un pago y lo imputa automáticamente a las facturas más viejas en estado ISSUED.
    Opcionalmente, también aplica el saldo a favor del cliente a esas mismas facturas.

    Body:
    {
      "client_id": 1,
      "amount": "5000",                // opcional si use_credit=true (default 0)
      "method": "TRANSFER" | "MERCADOPAGO" | "CASH" | "CARD",  // requerido si amount > 0
      "reference": "op123",
      "note": "...",
      "paid_at": "2026-01-31",        // opcional (por defecto hoy)
      "invoice_ids": [10, 11],        // opcional (si no viene, imputa FIFO)
      "use_credit": true              // opcional: aplica el saldo a favor disponible
    }
    """
    data = request.get_json(force=True) or {}
    client_id = data.get("client_id")
    if not client_id:
        return jsonify({"error": "client_id_required"}), 400

    use_credit = bool(data.get("use_credit"))

    amount_raw = data.get("amount")
    if amount_raw is None:
        if not use_credit:
            return jsonify({"error": "amount_required"}), 400
        amount = Decimal("0")
    else:
        try:
            amount = Decimal(str(amount_raw))
        except Exception:
            return jsonify({"error": "invalid_amount"}), 400
    if amount < 0:
        return jsonify({"error": "invalid_amount"}), 400
    if amount == 0 and not use_credit:
        return jsonify({"error": "amount_must_be_positive"}), 400

    # Medio de pago (normalizado). Sin pago en efectivo/transferencia (solo saldo a favor), no aplica.
    method_norm = None
    if amount > 0:
        method_raw = (data.get("method") or "").strip()
        if not method_raw:
            return jsonify({"error": "method_required"}), 400
        method_upper = method_raw.upper()
        method_map = {
            "TRANSFER": {"TRANSFER", "TRANSFERENCIA", "TRANSFERENCIA_BANCARIA", "BANK_TRANSFER", "TRANSFERENCIA BANCARIA"},
            "MERCADOPAGO": {"MERCADOPAGO", "MP", "MERCADO_PAGO"},
            "CASH": {"CASH", "EFECTIVO"},
            "CARD": {"CARD", "TARJETA", "CREDIT_CARD", "DEBIT_CARD", "TARJETA DE CREDITO", "TARJETA DE DEBITO"},
        }
        for k, vals in method_map.items():
            if method_upper in {v.upper() for v in vals}:
                method_norm = k
                break
        if not method_norm:
            return jsonify({"error": "invalid_method"}), 400
    else:
        method_norm = "CREDIT"

    paid_at = today_local()
    if data.get("paid_at"):
        try:
            paid_at = date.fromisoformat(str(data.get("paid_at")))
        except Exception:
            return jsonify({"error": "invalid_paid_at"}), 400

    created_by_user_id = None
    ident = get_jwt_identity()
    if ident:
        try:
            created_by_user_id = int(ident)
        except Exception:
            created_by_user_id = None

    p = Payment(
        client_id=int(client_id),
        amount=amount,
        paid_at=paid_at,
        method=method_norm,
        reference=(data.get("reference") or None),
        note=(data.get("note") or None),
        created_by_user_id=created_by_user_id,
    )
    db.session.add(p)
    db.session.commit()

    invoice_ids = data.get("invoice_ids")
    wanted: list[int] | None = None
    if invoice_ids is not None:
        if not isinstance(invoice_ids, list) or not invoice_ids:
            return jsonify({"error": "invalid_invoice_ids"}), 400
        try:
            wanted = [int(x) for x in invoice_ids]
        except Exception:
            return jsonify({"error": "invalid_invoice_ids"}), 400

        found = (
            Invoice.query.filter(Invoice.id.in_(wanted))
            .filter(Invoice.client_id == int(client_id))
            .filter(Invoice.is_deleted.is_(False))
            .all()
        )
        found_map = {int(x.id): x for x in found}
        missing = [x for x in wanted if x not in found_map]
        if missing:
            return jsonify({"error": "invoice_not_found", "invoice_ids": missing}), 404

        invalid = [int(x.id) for x in found_map.values() if x.status in ("VOID", "PAID")]
        if invalid:
            return jsonify({"error": "invoice_not_payable", "invoice_ids": invalid}), 409

    allocate_payment(p, wanted)

    credit_applied = Decimal("0")
    if use_credit:
        if wanted:
            for inv_id in wanted:
                credit_applied += apply_client_credit(int(client_id), invoice=found_map[inv_id])
        else:
            credit_applied += apply_client_credit(int(client_id))

    db.session.commit()

    # Encolar actualización de estado de servicios
    from ..tasks.queue import enqueue_job, JOB_BILLING_UPDATE_CLIENT_SERVICES
    enqueue_job(
        job_type=JOB_BILLING_UPDATE_CLIENT_SERVICES,
        payload={"client_id": int(client_id)},
    )
    logger.info("Pago #%d registrado, actualización de servicios encolada para cliente #%s", p.id, client_id)

    return jsonify({**_payment_to_dict(p), "credit_applied": str(credit_applied)}), 201


@bp.get("")
@jwt_required(optional=True)
def list_payments():
    client_id = request.args.get("client_id")
    day = request.args.get("day")
    month = request.args.get("month")
    year = request.args.get("year")
    date_from = request.args.get("from")
    date_to = request.args.get("to")

    q = Payment.query
    if client_id:
        q = q.filter_by(client_id=int(client_id))

    # filtros por paid_at (si está en null, no matchea filtros; los nuevos pagos ya lo setean)
    if day:
        try:
            d = date.fromisoformat(str(day))
        except Exception:
            return jsonify({"error": "invalid_day"}), 400
        q = q.filter(Payment.paid_at == d)
    elif month:
        try:
            y_str, m_str = str(month).split("-", 1)
            y_i = int(y_str)
            m_i = int(m_str)
            start = date(y_i, m_i, 1)
            end = date(y_i + 1, 1, 1) if m_i == 12 else date(y_i, m_i + 1, 1)
        except Exception:
            return jsonify({"error": "invalid_month"}), 400
        q = q.filter(Payment.paid_at >= start).filter(Payment.paid_at < end)
    elif year:
        try:
            y_i = int(year)
            start = date(y_i, 1, 1)
            end = date(y_i + 1, 1, 1)
        except Exception:
            return jsonify({"error": "invalid_year"}), 400
        q = q.filter(Payment.paid_at >= start).filter(Payment.paid_at < end)
    else:
        if date_from:
            try:
                dfrom = date.fromisoformat(str(date_from))
            except Exception:
                return jsonify({"error": "invalid_from"}), 400
            q = q.filter(Payment.paid_at >= dfrom)
        if date_to:
            try:
                dto = date.fromisoformat(str(date_to))
            except Exception:
                return jsonify({"error": "invalid_to"}), 400
            q = q.filter(Payment.paid_at <= dto)

    items = q.order_by(Payment.id.desc()).limit(200).all()
    return jsonify([_payment_to_dict(p) for p in items])

