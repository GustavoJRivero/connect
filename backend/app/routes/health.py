from flask import Blueprint, jsonify
import time

bp = Blueprint("health", __name__, url_prefix="/api")


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

