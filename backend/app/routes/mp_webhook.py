import hashlib
import hmac
import logging
import re

from flask import Blueprint, jsonify, request

from ..portal.mp import mp_webhook_secret
from ..portal.mp_credit import credit_mp_payment

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
    value = str(pid or "").strip()
    return value if re.fullmatch(r"\d{1,32}", value) else None


def _valid_signature(payment_id: str) -> bool:
    secret = mp_webhook_secret()
    signature = request.headers.get("X-Signature") or ""
    request_id = request.headers.get("X-Request-Id") or ""
    if not secret or not signature or not request_id:
        return False
    parts = {}
    for item in signature.split(","):
        key, separator, value = item.strip().partition("=")
        if separator:
            parts[key] = value
    timestamp = parts.get("ts", "")
    received = parts.get("v1", "")
    if not timestamp or not received:
        return False
    manifest = f"id:{payment_id};request-id:{request_id};ts:{timestamp};"
    expected = hmac.new(secret.encode(), manifest.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, received)


# strict_slashes=False: Mercado Pago rechaza el webhook si la URL configurada
# tiene barra final y el endpoint responde 404.
@bp.route("/mercadopago", methods=["GET", "POST"], strict_slashes=False)
def mercadopago_webhook():
    """Notificación de Mercado Pago.

    Siempre responde 200: MP reintenta ante cualquier otro código y marca como
    fallida la prueba del panel. Los problemas quedan en el log.
    """
    pid = _payment_id_from_request()
    if not pid:
        return jsonify({"ok": True}), 200
    if not _valid_signature(pid):
        logger.warning("MP: webhook con firma inválida para payment_id=%s", pid)
        return jsonify({"error": "invalid_signature"}), 401
    result = credit_mp_payment(pid)
    return jsonify({"ok": True, "status": result.get("status")}), 200
