from flask import current_app

from ..models.setting import Setting


def _value(setting_key: str, env_key: str) -> str:
    s = Setting.query.get(setting_key)
    if s is not None and str(s.value or "").strip():
        return str(s.value).strip()
    return str(current_app.config.get(env_key) or "").strip()


def smartolt_base_url() -> str:
    return _value("smartolt.base_url", "SMARTOLT_BASE_URL")


def smartolt_api_key() -> str:
    return _value("smartolt.api_key", "SMARTOLT_API_KEY")


def smartolt_writes_disabled() -> bool:
    raw = current_app.config.get("SMARTOLT_WRITES_DISABLED")
    return str(raw or "").strip().lower() in ("1", "true", "yes", "on")
