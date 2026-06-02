import json
from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from ..extensions import db
from ..models.job import Job
from ..timezone import iso_utc

bp = Blueprint("jobs", __name__, url_prefix="/api/jobs")


def _job_to_dict(j: Job) -> dict:
    return {
        "id": j.id,
        "created_at": iso_utc(j.created_at),
        "status": j.status,
        "job_type": j.job_type,
        "server_id": j.server_id,
        "attempts": j.attempts,
        "run_after": iso_utc(j.run_after),
        "locked_at": iso_utc(j.locked_at),
        "finished_at": iso_utc(j.finished_at),
        "payload": json.loads(j.payload_json or "{}"),
        "result": json.loads(j.result_json or "null") if j.result_json else None,
        "last_error": j.last_error,
    }


@bp.get("")
@jwt_required(optional=True)
def list_jobs():
    status = request.args.get("status")
    server_id = request.args.get("server_id")
    job_type = request.args.get("job_type")
    limit = request.args.get("limit", 200, type=int)
    offset = request.args.get("offset", 0, type=int)
    q = Job.query
    if status:
        q = q.filter_by(status=status.upper())
    if server_id:
        q = q.filter_by(server_id=int(server_id))
    if job_type:
        q = q.filter_by(job_type=job_type.upper())
    total = q.count()
    items = q.order_by(Job.id.desc()).offset(offset).limit(min(limit, 500)).all()
    return jsonify({"items": [_job_to_dict(x) for x in items], "total": total})


@bp.get("/types")
@jwt_required(optional=True)
def list_job_types():
    """Devuelve los tipos de job distintos que existen en la tabla."""
    rows = db.session.query(Job.job_type).distinct().all()
    return jsonify([r[0] for r in rows])


@bp.get("/<int:job_id>")
@jwt_required(optional=True)
def get_job(job_id: int):
    j = Job.query.get_or_404(job_id)
    return jsonify(_job_to_dict(j))


@bp.post("/<int:job_id>/retry")
@jwt_required(optional=True)
def retry_job(job_id: int):
    j = Job.query.get_or_404(job_id)
    if j.status == "DONE":
        return jsonify({"error": "already_done"}), 409
    if j.status == "CANCELLED":
        return jsonify({"error": "job_cancelled"}), 409
    # Permitir reintentar FAILED o RUNNING (colgado)
    j.status = "PENDING"
    j.attempts = 0
    j.run_after = None
    j.locked_at = None
    j.finished_at = None
    j.result_json = None
    j.last_error = None
    db.session.commit()
    return jsonify(_job_to_dict(j))


STUCK_RUNNING_SECONDS = 35


@bp.post("/recover-stuck")
@jwt_required(optional=True)
def recover_stuck():
    """Vuelve a PENDING los jobs RUNNING que llevan más de 35s (colgados). Opcional: server_id."""
    server_id = request.args.get("server_id", type=int)
    now = datetime.utcnow()
    cutoff = now - timedelta(seconds=STUCK_RUNNING_SECONDS)
    q = (
        Job.query.filter(Job.status == "RUNNING")
        .filter(Job.locked_at.isnot(None))
        .filter(Job.locked_at < cutoff)
    )
    if server_id is not None:
        q = q.filter(Job.server_id == server_id)
    stuck = q.all()
    for j in stuck:
        j.status = "PENDING"
        j.locked_at = None
        j.run_after = None  # para que el worker los tome de inmediato
    if stuck:
        db.session.commit()
    return jsonify({"recovered": [x.id for x in stuck], "count": len(stuck)})


@bp.post("/<int:job_id>/cancel")
@jwt_required(optional=True)
def cancel_job(job_id: int):
    """Quita el job de la cola: pasa a CANCELLED y no se ejecutará. Solo para PENDING."""
    j = Job.query.get_or_404(job_id)
    if j.status != "PENDING":
        return jsonify({"error": "only_pending_can_be_cancelled", "status": j.status}), 409
    j.status = "CANCELLED"
    j.run_after = None
    j.locked_at = None
    j.finished_at = datetime.utcnow()
    j.last_error = j.last_error or "Cancelado por el usuario"
    db.session.commit()
    return jsonify(_job_to_dict(j))

