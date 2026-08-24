import logging
from decimal import Decimal

from flask import Blueprint, jsonify, request

from ..billing.allocate import allocate_payment
from ..extensions import db
from ..models.client_portal import MpCheckout
from ..models.invoice import Invoice
from ..models.payment import Payment
from ..portal.mp import get_payment
from ..portal.notify import notify_payment
from ..tasks.queue import JOB_BILLING_UPDATE_CLIENT_SERVICES, enqueue_job
from ..timezone import today_local

logger = logging.getLogger(__name__)

bp = Blueprint("mp_webhook", __name__, url_prefix="/api/webhooks")


def _payment_id_from_request() -> str | None:
    data = request.get_json(silent=True) or {}
    pid = (
        request.args.get("id")
        or request.args.get("data.id")
        or (data.get("data") or {}).get("id")
        or data.get("id")
    )
    topic = (request.args.get("topic") or request.args.get("type") or data.get("type") or data.get("topic") or "").lower()
    if topic and topic not in ("payment", "merchant_order"):
        return None
    return str(pid) if pid else None


@bp.route("/mercadopago", methods=["GET", "POST"])
def mercadopago_webhook():
    pid = _payment_id_from_request()
    if not pid:
        return jsonify({"ok": True}), 200
    try:
        pay = get_payment(pid)
    except Exception as e:
        logger.warning("MP webhook: no se pudo leer el pago %s: %s", pid, e)
        return jsonify({"ok": True}), 200

    status = str(pay.get("status") or "").lower()
    if status != "approved":
        checkout = MpCheckout.query.filter_by(mp_payment_id=str(pid)).first()
        if checkout:
            checkout.status = "REJECTED" if status in ("rejected", "cancelled") else checkout.status
            db.session.commit()
        return jsonify({"ok": True}), 200

    if Payment.query.filter_by(reference=f"mp:{pid}").first():
        return jsonify({"ok": True, "duplicate": True}), 200

    ext = str(pay.get("external_reference") or "")
    invoice_id = None
    client_id = None
    # inv:123:cli:45
    parts = ext.split(":")
    try:
        if "inv" in parts:
            invoice_id = int(parts[parts.index("inv") + 1])
        if "cli" in parts:
            client_id = int(parts[parts.index("cli") + 1])
    except Exception:
        pass

    amount = Decimal(str(pay.get("transaction_amount") or 0))
    if amount <= 0:
        return jsonify({"ok": True}), 200

    invoice = Invoice.query.get(invoice_id) if invoice_id else None
    if invoice:
        client_id = client_id or int(invoice.client_id)

    if not client_id:
        logger.warning("MP webhook: pago %s sin cliente (ref=%s)", pid, ext)
        return jsonify({"ok": True}), 200

    p = Payment(
        client_id=int(client_id),
        amount=amount,
        paid_at=today_local(),
        method="MERCADOPAGO",
        reference=f"mp:{pid}",
        note="Pago portal Mercado Pago",
    )
    db.session.add(p)
    db.session.flush()
    allocate_payment(p, [int(invoice.id)] if invoice else None)

    checkout = MpCheckout.query.filter_by(preference_id=str(pay.get("preference_id") or "")).first()
    if not checkout and invoice:
        checkout = (
            MpCheckout.query.filter_by(invoice_id=int(invoice.id), client_id=int(client_id))
            .order_by(MpCheckout.id.desc())
            .first()
        )
    if checkout:
        checkout.status = "APPROVED"
        checkout.mp_payment_id = str(pid)

    notify_payment(client_id=int(client_id), invoice_id=(int(invoice.id) if invoice else None), amount=amount)
    db.session.commit()
    enqueue_job(job_type=JOB_BILLING_UPDATE_CLIENT_SERVICES, payload={"client_id": int(client_id)})
    logger.info("MP webhook: pago %s acreditado cliente #%s", pid, client_id)
    return jsonify({"ok": True}), 200
