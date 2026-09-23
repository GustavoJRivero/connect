"""Validación server-side de Google reCAPTCHA v3."""

import logging

import requests
from flask import current_app, request

logger = logging.getLogger(__name__)

VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify"


def recaptcha_enabled() -> bool:
    return bool(
        current_app.config.get("RECAPTCHA_SITE_KEY")
        and current_app.config.get("RECAPTCHA_SECRET_KEY")
    )


def recaptcha_public_config() -> dict:
    return {
        "enabled": recaptcha_enabled(),
        "site_key": current_app.config.get("RECAPTCHA_SITE_KEY") or None,
    }


def verify_recaptcha(token: str, expected_action: str) -> bool:
    """Fail-closed cuando está configurado; en desarrollo permite no configurarlo."""
    if not recaptcha_enabled():
        return current_app.config.get("APP_ENV") != "production"
    if not token:
        return False
    try:
        response = requests.post(
            VERIFY_URL,
            data={
                "secret": current_app.config["RECAPTCHA_SECRET_KEY"],
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
