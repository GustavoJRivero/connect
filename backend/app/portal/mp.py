import logging
from decimal import Decimal

from flask import current_app

logger = logging.getLogger(__name__)


def _db_value(setting_key: str) -> str:
    from ..models.setting import Setting

    s = Setting.query.get(setting_key)
    return str(s.value).strip() if s is not None and str(s.value or "").strip() else ""


def _env_value(env_key: str) -> str:
    return (current_app.config.get(env_key) or "").strip()


def _mp_value(setting_key: str, env_key: str) -> str:
    return _db_value(setting_key) or _env_value(env_key)


def mp_credentials() -> dict[str, str]:
    """Credenciales de Mercado Pago tomadas de un único origen.

    El access token y la public key tienen que ser del mismo par: si se mezclan
    (una del panel y la otra del .env) Mercado Pago rechaza el checkout con
    "una de las partes es de prueba". Por eso el par se resuelve junto: si el
    panel tiene alguna de las dos, manda el panel; si no, manda el .env.
    """
    db_token, db_key = _db_value("mp.access_token"), _db_value("mp.public_key")
    if db_token or db_key:
        token, public_key, source = db_token, db_key, "panel"
    else:
        token, public_key, source = _env_value("MP_ACCESS_TOKEN"), _env_value("MP_PUBLIC_KEY"), "env"
    return {
        "access_token": token,
        "public_key": public_key,
        "source": source,
        "webhook_url": _mp_value("mp.webhook_url", "MP_WEBHOOK_URL"),
        "portal_url": portal_base_url(),
    }


def portal_base_url() -> str:
    """URL pública del portal para las back_urls del checkout.

    Con `localhost` Mercado Pago descarta el retorno automático, así que si no
    está configurada usamos el origen real del pedido (el portal y el panel
    comparten dominio).
    """
    from flask import has_request_context, request

    url = _mp_value("mp.portal_url", "PORTAL_PUBLIC_URL").rstrip("/")
    if url and not _is_local(url):
        return url
    if has_request_context():
        proto = request.headers.get("X-Forwarded-Proto") or request.scheme
        host = request.headers.get("X-Forwarded-Host") or request.host
        if host and not _is_local(host):
            return f"{proto}://{host}"
    return url or "http://localhost"


def _is_local(value: str) -> bool:
    return "localhost" in value or "127.0.0.1" in value


def mp_configured() -> bool:
    creds = mp_credentials()
    return bool(creds["access_token"] and creds["public_key"])


def mp_public_key() -> str:
    return mp_credentials()["public_key"]


def preference_checkout_url(pref: dict) -> str | None:
    """Siempre init_point: MP unificó test y prod en la misma URL."""
    return pref.get("init_point") or pref.get("sandbox_init_point")


def create_preference(*, invoice_id: int, title: str, amount: Decimal, email: str | None, client_id: int) -> dict:
    creds = mp_credentials()
    token = creds["access_token"]
    if not token:
        raise RuntimeError("mp_not_configured")

    import mercadopago

    sdk = mercadopago.SDK(token)
    portal_url = creds["portal_url"]
    notify_url = creds["webhook_url"]
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
        "statement_descriptor": "CONNECT",
    }
    if email:
        preference["payer"] = {"email": email}
    if notify_url:
        preference["notification_url"] = notify_url

    # "all" devuelve al portal también con pago rechazado o pendiente. Si MP
    # rechaza la preferencia (por ejemplo con back_urls no públicas) probamos
    # con menos exigencia antes de darla por fallida.
    body: dict = {}
    status = 0
    for auto_return in ("all", "approved", None):
        if auto_return:
            preference["auto_return"] = auto_return
        else:
            preference.pop("auto_return", None)
        result = sdk.preference().create(preference)
        status = int(result.get("status") or 0)
        body = result.get("response") or {}
        if status in (200, 201):
            break
        logger.info("Mercado Pago rechazó auto_return=%s: %s", auto_return, body.get("message"))
    if status not in (200, 201):
        logger.warning("Mercado Pago preference error: %s %s", status, body)
        raise RuntimeError(body.get("message") or "mp_preference_failed")
    return body


def get_payment(payment_id: str) -> dict:
    token = mp_credentials()["access_token"]
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
