from flask import Blueprint, jsonify
import time

from ..timezone import get_app_tz_name, iso_utc, now_local, offset_minutes

bp = Blueprint("health", __name__, url_prefix="/api")


@bp.get("/timezone")
def timezone_info():
    """Expone la TZ configurada para que el frontend pueda formatear fechas en local."""
    nl = now_local()
    return jsonify({
        "timezone": get_app_tz_name(),
        "now_local": nl.isoformat(),
        "now_utc": iso_utc(nl),
        "offset_minutes": offset_minutes(),
    })


@bp.get("/health")
def health():
    try:
        from app.tasks.worker import _last_claim_at
        ago = round(time.time() - _last_claim_at, 1) if _last_claim_at else None
        # worker_active: True=reclamó hace <2min, False=reclamó hace >2min (posible colgado), None=nunca reclamó
        worker_active = (ago is not None and ago < 120) if _last_claim_at else None
        return jsonify({
            "status": "ok",
            "worker_last_claim_ago_sec": ago,
            "worker_active": worker_active,
        })
    except Exception:
        return jsonify({"status": "ok", "worker_active": None})

