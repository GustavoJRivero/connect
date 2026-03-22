"""
Wrapper sobre el SDK oficial de Mercado Pago.

Uso:
    from app.mercadopago.client import get_mp_client, MpClient

    mp = get_mp_client()               # usa MERCADOPAGO_ACCESS_TOKEN del env
    pref = mp.create_preference(...)
"""
import os
from typing import Optional
import mercadopago


def get_mp_client() -> "MpClient":
    token = os.environ.get("MERCADOPAGO_ACCESS_TOKEN", "")
    if not token:
        raise RuntimeError("MERCADOPAGO_ACCESS_TOKEN no configurado en .env")
    return MpClient(access_token=token)


class MpClient:
    def __init__(self, *, access_token: str):
        self._sdk = mercadopago.SDK(access_token)

    def create_preference(
        self,
        *,
        title: str,
        quantity: int,
        unit_price: float,
        external_reference: str,
        back_url_success: str,
        back_url_pending: str,
        back_url_failure: str,
        notification_url: str,
        payer_email: Optional[str] = None,
    ) -> dict:
        """
        Crea una preferencia de pago en MP y devuelve la respuesta completa.

        El `external_reference` debe ser el ID de la MpPreference en nuestra DB
        para poder relacionar el webhook con la preferencia.
        """
        preference_data = {
            "items": [
                {
                    "title": title,
                    "quantity": quantity,
                    "unit_price": unit_price,
                    "currency_id": "ARS",
                }
            ],
            "external_reference": str(external_reference),
            "back_urls": {
                "success": back_url_success,
                "pending": back_url_pending,
                "failure": back_url_failure,
            },
            "auto_return": "approved",
            "notification_url": notification_url,
        }

        if payer_email:
            preference_data["payer"] = {"email": payer_email}

        response = self._sdk.preference().create(preference_data)
        if response["status"] not in (200, 201):
            raise RuntimeError(
                f"MP create_preference falló: status={response['status']} "
                f"response={response.get('response')}"
            )
        return response["response"]

    def get_payment(self, mp_payment_id: str) -> dict:
        """Consulta el estado de un pago por su ID de MP."""
        response = self._sdk.payment().get(mp_payment_id)
        if response["status"] != 200:
            raise RuntimeError(
                f"MP get_payment falló: status={response['status']} "
                f"response={response.get('response')}"
            )
        return response["response"]
