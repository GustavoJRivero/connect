"""Protección temporal: bloquear escrituras a Mikrotik en staging."""
from __future__ import annotations

from typing import Any

MT_WRITE_JOB_TYPES = frozenset(
    {
        "MT_CREATE_PPP_SECRET",
        "MT_DELETE_PPP_SECRET",
        "MT_SET_PPP_PROFILE",
        "MT_SET_PPP_REMOTE_ADDRESS",
        "MT_SET_PPP_CREDENTIALS",
        "MT_SET_PPP_COMMENT",
        "MT_CREATE_PPP_PROFILE",
        "MT_UPDATE_PPP_PROFILE",
        "MT_DELETE_PPP_PROFILE",
        "BILLING_UPDATE_CLIENT_SERVICES",
    }
)


class MikrotikWritesDisabledError(Exception):
    code = "mikrotik_writes_disabled"
    message = (
        "Las escrituras a Mikrotik están deshabilitadas en este entorno (staging). "
        "No se modificaron usuarios PPPoE ni perfiles en el router."
    )

    def to_response(self):
        from flask import jsonify

        return jsonify({"error": self.code, "message": self.message}), 403


def _truthy(raw: Any) -> bool:
    return str(raw or "").strip().lower() in ("1", "true", "yes", "on")


def mikrotik_writes_disabled(app=None) -> bool:
    from flask import current_app

    cfg = app or current_app
    return _truthy(cfg.config.get("MIKROTIK_WRITES_DISABLED"))


def is_mikrotik_write_job(job_type: str) -> bool:
    return job_type in MT_WRITE_JOB_TYPES


def assert_mikrotik_writes_allowed(app=None) -> None:
    if mikrotik_writes_disabled(app):
        raise MikrotikWritesDisabledError()


def prod_host_list(app=None) -> list[str]:
    from flask import current_app

    cfg = app or current_app
    raw = str(cfg.config.get("MIKROTIK_PROD_HOSTS") or "").strip()
    if not raw:
        return []
    return [h.strip() for h in raw.split(",") if h.strip()]


def safety_status(app=None) -> dict[str, Any]:
    from flask import current_app

    from ..models.mikrotik_server import MikrotikServer

    cfg = app or current_app
    writes_disabled = mikrotik_writes_disabled(cfg)
    prod_hosts = prod_host_list(cfg)
    configured = [
        str(s.host or "").strip()
        for s in MikrotikServer.query.order_by(MikrotikServer.id.asc()).all()
        if str(s.host or "").strip()
    ]
    overlap = sorted(set(configured) & set(prod_hosts)) if prod_hosts else []
    risky_creds = MikrotikServer.query.filter(
        MikrotikServer.username != "CONFIGURAR",
        MikrotikServer.password != "CONFIGURAR",
        MikrotikServer.username.isnot(None),
        MikrotikServer.password.isnot(None),
    ).count()

    return {
        "mikrotik_writes_disabled": writes_disabled,
        "mikrotik_prod_hosts": prod_hosts,
        "configured_server_hosts": configured,
        "prod_host_overlap": overlap,
        "servers_with_real_credentials": int(risky_creds),
        "staging_safe": writes_disabled and not overlap,
    }
