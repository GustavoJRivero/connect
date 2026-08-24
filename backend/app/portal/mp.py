import logging
from decimal import Decimal

from flask import current_app

logger = logging.getLogger(__name__)


def _mp_value(setting_key: str, env_key: str) -> str:
    from ..models.setting import Setting

    s = Setting.query.get(setting_key)
    if s is not None and str(s.value or "").strip():
        return str(s.value).strip()
    return (current_app.config.get(env_key) or "").strip()


def mp_configured() -> bool:
    return bool(_mp_value("mp.access_token", "MP_ACCESS_TOKEN"))


def mp_public_key() -> str:
    return _mp_value("mp.public_key", "MP_PUBLIC_KEY")


def create_preference(*, invoice_id: int, title: str, amount: Decimal, email: str | None, client_id: int) -> dict:
    token = _mp_value("mp.access_token", "MP_ACCESS_TOKEN")
    if not token:
        raise RuntimeError("mp_not_configured")

    import mercadopago

    sdk = mercadopago.SDK(token)
    portal_url = (current_app.config.get("PORTAL_PUBLIC_URL") or "http://localhost").rstrip("/")
    notify_url = _mp_value("mp.webhook_url", "MP_WEBHOOK_URL")
    if not notify_url:
        api_url = (current_app.config.get("API_PUBLIC_URL") or "").rstrip("/")
        if api_url:
            notify_url = f"{api_url}/api/webhooks/mercadopago"

    preference = {
        "items": [
            {
                "id": str(invoice_id),
                "title": title[:127],
                "quantity": 1,
                "currency_id": "ARS",
                "unit_price": float(amount),
            }
        ],
        "external_reference": f"inv:{invoice_id}:cli:{client_id}",
        "back_urls": {
            "success": f"{portal_url}/portal/invoices?paid=1",
            "failure": f"{portal_url}/portal/invoices?paid=0",
            "pending": f"{portal_url}/portal/invoices?paid=pending",
        },
        "auto_return": "approved",
        "statement_descriptor": "CONNECT",
    }
    if email:
        preference["payer"] = {"email": email}
    if notify_url:
        preference["notification_url"] = notify_url

    result = sdk.preference().create(preference)
    status = int(result.get("status") or 0)
    body = result.get("response") or {}
    if status not in (200, 201) and preference.get("auto_return"):
        preference.pop("auto_return", None)
        result = sdk.preference().create(preference)
        status = int(result.get("status") or 0)
        body = result.get("response") or {}
    if status not in (200, 201):
        logger.warning("Mercado Pago preference error: %s %s", status, body)
        raise RuntimeError(body.get("message") or "mp_preference_failed")
    return body


def get_payment(payment_id: str) -> dict:
    token = _mp_value("mp.access_token", "MP_ACCESS_TOKEN")
    if not token:
        raise RuntimeError("mp_not_configured")
    import mercadopago

    sdk = mercadopago.SDK(token)
    result = sdk.payment().get(payment_id)
    status = int(result.get("status") or 0)
    body = result.get("response") or {}
    if status not in (200, 201):
        raise RuntimeError(body.get("message") or "mp_payment_not_found")
    return body
