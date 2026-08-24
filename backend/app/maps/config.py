"""Credenciales Connect Maps: settings (DB) con fallback a variables de entorno."""

from flask import current_app


def maps_value(setting_key: str, env_key: str) -> str:
    from ..models.setting import Setting

    s = Setting.query.get(setting_key)
    if s is not None and str(s.value or "").strip():
        return str(s.value).strip()
    return (current_app.config.get(env_key) or "").strip()


def maps_api_base_url() -> str:
    return maps_value("maps.api_base_url", "MAPS_API_BASE_URL") or "https://maps.connectsrl.ar"


def maps_api_key() -> str:
    return maps_value("maps.api_key", "MAPS_API_KEY")


def maps_webhook_secret() -> str:
    return maps_value("maps.webhook_secret", "MAPS_WEBHOOK_SECRET")


def maps_configured() -> bool:
    return bool(maps_api_base_url() and maps_api_key())
