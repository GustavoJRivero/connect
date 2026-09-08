import logging

from flask import Blueprint, jsonify, request

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
    return str(pid) if pid else None


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
    result = credit_mp_payment(pid)
    return jsonify({"ok": True, "status": result.get("status")}), 200
