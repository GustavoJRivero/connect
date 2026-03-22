"""
Rutas de integración con Mercado Pago.

Endpoints:
  POST /api/mercadopago/create_preference   → crea link de pago (requiere JWT)
  POST /api/mercadopago/webhook             → recibe notificaciones de MP (público)
"""
import hashlib
import hmac
import logging
import os
from datetime import datetime
from decimal import Decimal

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from ..extensions import db
from ..logging_utils import slog
from ..mercadopago.client import get_mp_client
from ..models.client import Client
from ..models.invoice import Invoice
from ..models.mp_preference import MpPreference
from ..models.payment import Payment, PaymentAllocation

logger = logging.getLogger(__name__)

bp = Blueprint("mercadopago", __name__, url_prefix="/api/mercadopago")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _invoice_balance(inv: Invoice) -> Decimal:
    return Decimal(str(inv.total)) - Decimal(str(inv.paid_total))


def _allocate_payment(payment: Payment, invoice_ids: list[int]) -> None:
    """Imputa el pago a las facturas en el orden dado, lógica FIFO."""
    invoices = (
        Invoice.query
        .filter(Invoice.id.in_(invoice_ids))
        .filter(Invoice.client_id == payment.client_id)
        .filter(Invoice.is_deleted.is_(False))
        .filter(Invoice.status == "ISSUED")
        .order_by(Invoice.issue_date.asc(), Invoice.id.asc())
        .all()
    )
    remaining = Decimal(str(payment.amount))
    for inv in invoices:
        if remaining <= 0:
            break
        bal = _invoice_balance(inv)
        if bal <= 0:
            continue
        applied = min(remaining, bal)
        inv.paid_total = Decimal(str(inv.paid_total)) + applied
        remaining -= applied
        db.session.add(PaymentAllocation(payment_id=payment.id, invoice_id=inv.id, amount=applied))
        if _invoice_balance(inv) <= 0:
            inv.status = "PAID"


def _base_url() -> str:
    """URL base del frontend para los back_urls de MP."""
    return os.environ.get("FRONTEND_URL", "http://localhost:3000")


def _backend_url() -> str:
    """URL base del backend para el webhook de MP."""
    return os.environ.get("BACKEND_URL", "http://localhost:5001")


# ---------------------------------------------------------------------------
# POST /api/mercadopago/create_preference
# ---------------------------------------------------------------------------

@bp.post("/create_preference")
@jwt_required(optional=True)
def create_preference():
    """
    Crea una preferencia de pago en MP para una o más facturas.

    Body:
    {
      "client_id": 1,
      "invoice_ids": [10, 11]   // facturas a incluir en el link
    }

    Response 201:
    {
      "preference_id": "...",
      "init_point": "https://www.mercadopago.com.ar/checkout/...",
      "sandbox_init_point": "https://sandbox.mercadopago.com.ar/...",
      "mp_preference_id": 42    // ID interno (MpPreference.id)
    }
    """
    data = request.get_json(force=True) or {}
    client_id = data.get("client_id")
    invoice_ids = data.get("invoice_ids")

    if not client_id:
        return jsonify({"error": "client_id_required"}), 400
    if not invoice_ids or not isinstance(invoice_ids, list):
        return jsonify({"error": "invoice_ids_required"}), 400

    client = Client.query.get(int(client_id))
    if not client:
        return jsonify({"error": "client_not_found"}), 404

    # Verificar facturas
    invoice_ids_int = [int(x) for x in invoice_ids]
    invoices = (
        Invoice.query
        .filter(Invoice.id.in_(invoice_ids_int))
        .filter(Invoice.client_id == int(client_id))
        .filter(Invoice.is_deleted.is_(False))
        .filter(Invoice.status.in_(["ISSUED", "DRAFT"]))
        .all()
    )
    if len(invoices) != len(invoice_ids_int):
        found_ids = {int(inv.id) for inv in invoices}
        missing = [x for x in invoice_ids_int if x not in found_ids]
        return jsonify({"error": "invoice_not_found", "invoice_ids": missing}), 404

    total = sum(_invoice_balance(inv) for inv in invoices)
    if total <= 0:
        return jsonify({"error": "invoices_already_paid"}), 409

    # Buscar email del cliente (puede ser None si no tiene)
    payer_email = getattr(client, "email", None) or None

    # Descripción del link
    nums = ", ".join(str(inv.cbte_number or inv.id) for inv in invoices)
    title = f"Facturas {nums}" if len(invoices) > 1 else f"Factura {nums}"

    # Guardar el registro en nuestra DB antes de llamar a MP
    # (necesitamos nuestro ID como external_reference)
    pref_record = MpPreference(
        client_id=int(client_id),
        total=total,
        status="PENDING",
    )
    pref_record.invoice_ids = invoice_ids_int
    db.session.add(pref_record)
    db.session.flush()  # obtiene el ID sin commitear

    base = _base_url()
    backend = _backend_url()

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
            payer_email=payer_email,
        )
    except Exception as exc:
        db.session.rollback()
        logger.exception("Error creando preferencia MP para cliente #%s", client_id)
        slog(
            module="MERCADOPAGO",
            action="CREATE_PREFERENCE_ERROR",
            message=str(exc),
            level="ERROR",
            details={"client_id": client_id, "invoice_ids": invoice_ids_int},
        )
        return jsonify({"error": "mp_error", "detail": str(exc)}), 502

    pref_record.preference_id = mp_response["id"]
    db.session.commit()

    slog(
        module="MERCADOPAGO",
        action="PREFERENCE_CREATED",
        message=f"Link de pago creado: preference_id={mp_response['id']}",
        level="INFO",
        details={
            "client_id": client_id,
            "invoice_ids": invoice_ids_int,
            "total": str(total),
        },
        ref_id=pref_record.id,
        ref_type="mp_preference",
    )

    return jsonify({
        "preference_id": mp_response["id"],
        "init_point": mp_response.get("init_point"),
        "sandbox_init_point": mp_response.get("sandbox_init_point"),
        "mp_preference_id": pref_record.id,
    }), 201


# ---------------------------------------------------------------------------
# POST /api/mercadopago/webhook
# ---------------------------------------------------------------------------

@bp.post("/webhook")
def mp_webhook():
    """
    Recibe notificaciones de pago de Mercado Pago (IPN / Webhooks).

    MP puede enviar el mismo evento más de una vez → este handler es IDEMPOTENTE.
    Siempre responder 200 rápido aunque no procesemos el evento.
    """
    # Validar firma si el secret está configurado
    webhook_secret = os.environ.get("MERCADOPAGO_WEBHOOK_SECRET", "")
    if webhook_secret:
        ts = request.headers.get("x-signature", "")
        x_request_id = request.headers.get("x-request-id", "")
        sig_header = request.headers.get("x-signature", "")
        # Formato: "ts=<timestamp>,v1=<hmac>"
        parts = dict(p.split("=", 1) for p in sig_header.split(",") if "=" in p)
        ts_value = parts.get("ts", "")
        v1_value = parts.get("v1", "")
        manifest = f"id:{request.args.get('data.id', '')};request-id:{x_request_id};ts:{ts_value};"
        expected = hmac.new(
            webhook_secret.encode(), manifest.encode(), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(expected, v1_value):
            logger.warning("MP webhook: firma inválida")
            return jsonify({"error": "invalid_signature"}), 401

    payload = request.get_json(force=True, silent=True) or {}
    event_type = payload.get("type")
    data_id = (payload.get("data") or {}).get("id") or request.args.get("data.id")

    logger.info("MP webhook recibido: type=%s data.id=%s", event_type, data_id)

    # Solo procesamos eventos de tipo "payment"
    if event_type != "payment" or not data_id:
        return jsonify({"status": "ignored"}), 200

    try:
        _process_mp_payment(str(data_id))
    except Exception:
        logger.exception("Error procesando pago MP #%s", data_id)
        # Igualmente retornamos 200 para que MP no reintente indefinidamente
        # El error queda en los logs del sistema

    return jsonify({"status": "ok"}), 200


def _process_mp_payment(mp_payment_id: str) -> None:
    """
    Consulta el pago a MP y, si está aprobado, lo registra en el sistema.
    Idempotente: si el mp_payment_id ya fue procesado, no hace nada.
    """
    # Verificar si ya procesamos este pago (idempotencia)
    already = MpPreference.query.filter_by(mp_payment_id=mp_payment_id).first()
    if already and already.status == "PAID":
        logger.info("MP payment %s ya procesado (preference #%d)", mp_payment_id, already.id)
        return

    # Consultar pago a MP
    mp = get_mp_client()
    payment_data = mp.get_payment(mp_payment_id)

    status = payment_data.get("status")
    external_reference = payment_data.get("external_reference")
    transaction_amount = payment_data.get("transaction_amount") or 0

    logger.info(
        "MP payment %s: status=%s external_reference=%s amount=%s",
        mp_payment_id, status, external_reference, transaction_amount,
    )

    # Solo procesamos pagos aprobados
    if status != "approved":
        slog(
            module="MERCADOPAGO",
            action="PAYMENT_NOT_APPROVED",
            message=f"Pago MP {mp_payment_id} con status={status}, ignorado",
            level="INFO",
            details={"mp_payment_id": mp_payment_id, "status": status},
        )
        return

    # Buscar la preferencia en nuestra DB por external_reference
    if not external_reference:
        logger.error("MP payment %s sin external_reference, no se puede imputar", mp_payment_id)
        return

    pref = MpPreference.query.get(int(external_reference))
    if not pref:
        logger.error("MP preference #%s no encontrada en DB", external_reference)
        return

    if pref.status == "PAID":
        logger.info("MP preference #%d ya pagada, ignorando duplicado", pref.id)
        return

    # Crear el pago en nuestro sistema
    payment = Payment(
        client_id=pref.client_id,
        amount=Decimal(str(transaction_amount)),
        paid_at=datetime.utcnow().date(),
        method="MERCADOPAGO",
        reference=mp_payment_id,
        note=f"Pago automático vía Mercado Pago (preference_id={pref.preference_id})",
    )
    db.session.add(payment)
    db.session.flush()

    # Imputar a las facturas
    _allocate_payment(payment, pref.invoice_ids)

    # Marcar la preferencia como pagada
    pref.status = "PAID"
    pref.paid_at = datetime.utcnow()
    pref.payment_id = payment.id
    pref.mp_payment_id = mp_payment_id

    db.session.commit()

    # Encolar evaluación de servicios para cortar/restaurar si corresponde
    from ..tasks.queue import enqueue_job, JOB_BILLING_UPDATE_CLIENT_SERVICES
    enqueue_job(
        job_type=JOB_BILLING_UPDATE_CLIENT_SERVICES,
        payload={"client_id": pref.client_id},
    )

    slog(
        module="MERCADOPAGO",
        action="PAYMENT_CONFIRMED",
        message=f"Pago MP confirmado: payment #{payment.id}, monto={transaction_amount}",
        level="INFO",
        details={
            "mp_payment_id": mp_payment_id,
            "payment_id": payment.id,
            "client_id": pref.client_id,
            "invoice_ids": pref.invoice_ids,
            "amount": str(transaction_amount),
        },
        ref_id=payment.id,
        ref_type="payment",
    )
    logger.info(
        "Pago MP #%s procesado correctamente → Payment #%d para cliente #%d",
        mp_payment_id, payment.id, pref.client_id,
    )
