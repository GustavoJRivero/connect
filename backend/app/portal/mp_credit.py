"""Acreditación de pagos de Mercado Pago.

Lo usan el webhook y el retorno del checkout, así el pago se imputa por
cualquiera de los dos caminos. Es idempotente: la referencia `mp:<payment_id>`
evita duplicar el pago si llegan las dos notificaciones.
"""

import logging
from decimal import Decimal

from ..billing.allocate import allocate_payment
from ..extensions import db
from ..models.client_portal import MpCheckout
from ..models.invoice import Invoice
from ..models.payment import Payment
from ..tasks.queue import JOB_BILLING_UPDATE_CLIENT_SERVICES, enqueue_job
from ..timezone import today_local
from .mp import get_payment
from .notify import notify_payment

logger = logging.getLogger(__name__)


def _refs(pay: dict) -> tuple[int | None, int | None]:
    """Extrae invoice_id y client_id de external_reference (`inv:123:cli:45`)."""
    parts = str(pay.get("external_reference") or "").split(":")
    invoice_id = client_id = None
    try:
        if "inv" in parts:
            invoice_id = int(parts[parts.index("inv") + 1])
        if "cli" in parts:
            client_id = int(parts[parts.index("cli") + 1])
    except (ValueError, IndexError):
        pass
    return invoice_id, client_id


def credit_mp_payment(payment_id: str, expected_client_id: int | None = None) -> dict:
    """Consulta el pago en Mercado Pago y lo acredita si está aprobado.

    Nunca confía en los datos recibidos por notificación: relee el pago con
    nuestro access token. `expected_client_id` restringe la operación al
    cliente autenticado cuando la llamada viene del portal.
    """
    pid = str(payment_id)
    try:
        pay = get_payment(pid)
    except Exception as e:
        logger.warning("MP: no se pudo leer el pago %s: %s", pid, e)
        return {"status": "unknown", "payment_id": pid}

    invoice_id, client_id = _refs(pay)
    if expected_client_id is not None and client_id and int(client_id) != int(expected_client_id):
        logger.warning("MP: pago %s no pertenece al cliente #%s", pid, expected_client_id)
        return {"status": "forbidden", "payment_id": pid}

    mp_status = str(pay.get("status") or "").lower()
    checkout = MpCheckout.query.filter_by(preference_id=str(pay.get("preference_id") or "")).first()

    if mp_status != "approved":
        if checkout and mp_status in ("rejected", "cancelled"):
            checkout.status = "REJECTED"
            checkout.mp_payment_id = pid
            db.session.commit()
        return {
            "status": "rejected" if mp_status in ("rejected", "cancelled") else "pending",
            "mp_status": mp_status,
            "payment_id": pid,
            "invoice_id": invoice_id,
        }

    existing = Payment.query.filter_by(reference=f"mp:{pid}").first()
    if existing:
        return {
            "status": "duplicate",
            "payment_id": pid,
            "invoice_id": invoice_id,
            "amount": str(existing.amount),
        }

    amount = Decimal(str(pay.get("transaction_amount") or 0))
    if amount <= 0:
        return {"status": "unknown", "payment_id": pid}

    invoice = Invoice.query.get(invoice_id) if invoice_id else None
    if invoice:
        client_id = client_id or int(invoice.client_id)
    if not client_id:
        logger.warning("MP: pago %s sin cliente (ref=%s)", pid, pay.get("external_reference"))
        return {"status": "unknown", "payment_id": pid}

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

    if not checkout and invoice:
        checkout = (
            MpCheckout.query.filter_by(invoice_id=int(invoice.id), client_id=int(client_id))
            .order_by(MpCheckout.id.desc())
            .first()
        )
    if checkout:
        checkout.status = "APPROVED"
        checkout.mp_payment_id = pid

    notify_payment(client_id=int(client_id), invoice_id=(int(invoice.id) if invoice else None), amount=amount)
    db.session.commit()
    enqueue_job(job_type=JOB_BILLING_UPDATE_CLIENT_SERVICES, payload={"client_id": int(client_id)})
    logger.info("MP: pago %s acreditado al cliente #%s", pid, client_id)
    return {
        "status": "credited",
        "payment_id": pid,
        "invoice_id": invoice_id,
        "amount": str(amount),
    }
