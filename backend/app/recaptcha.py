"""Validación server-side de Google reCAPTCHA v3."""

import logging

import requests
from flask import current_app, request

logger = logging.getLogger(__name__)

VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify"


def _value(setting_key: str, env_key: str) -> str:
    """Primero lo cargado en Configuración → Seguridad, después el .env."""
    from .models.setting import Setting

    try:
        setting = Setting.query.get(setting_key)
    except Exception:  # noqa: BLE001 - sin base todavía (migraciones, CLI)
        setting = None
    panel = str(setting.value).strip() if setting is not None and str(setting.value or "").strip() else ""
    return panel or (current_app.config.get(env_key) or "").strip()


def recaptcha_site_key() -> str:
    return _value("security.recaptcha_site_key", "RECAPTCHA_SITE_KEY")


def recaptcha_secret_key() -> str:
    return _value("security.recaptcha_secret_key", "RECAPTCHA_SECRET_KEY")


def recaptcha_enabled() -> bool:
    return bool(recaptcha_site_key() and recaptcha_secret_key())


def recaptcha_public_config() -> dict:
    return {
        "enabled": recaptcha_enabled(),
        "site_key": recaptcha_site_key() or None,
    }


def verify_recaptcha(token: str, expected_action: str) -> bool:
    """Sin claves cargadas el captcha no se exige; con claves es fail-closed."""
    if not recaptcha_enabled():
        return True
    if not token:
        return False
    try:
        response = requests.post(
            VERIFY_URL,
            data={
                "secret": recaptcha_secret_key(),
                "response": token,
                "remoteip": request.remote_addr or "",
            },
            timeout=5,
        )
        payload = response.json() if response.ok else {}
    except (requests.RequestException, ValueError) as exc:
        logger.warning("No se pudo validar reCAPTCHA: %s", exc)
        return False
    score = payload.get("score")
    return bool(
        payload.get("success")
        and payload.get("action") == expected_action
        and isinstance(score, (int, float))
        and float(score) >= float(current_app.config["RECAPTCHA_MIN_SCORE"])
    )
