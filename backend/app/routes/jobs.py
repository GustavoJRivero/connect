import json

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from ..extensions import db
from ..models.job import Job

bp = Blueprint("jobs", __name__, url_prefix="/api/jobs")


def _job_to_dict(j: Job) -> dict:
    return {
        "id": j.id,
        "created_at": j.created_at.isoformat() if j.created_at else None,
        "status": j.status,
        "job_type": j.job_type,
        "server_id": j.server_id,
        "attempts": j.attempts,
        "run_after": j.run_after.isoformat() if j.run_after else None,
        "locked_at": j.locked_at.isoformat() if j.locked_at else None,
        "finished_at": j.finished_at.isoformat() if j.finished_at else None,
        "payload": json.loads(j.payload_json or "{}"),
        "result": json.loads(j.result_json or "null") if j.result_json else None,
        "last_error": j.last_error,
    }


@bp.get("")
@jwt_required(optional=True)
def list_jobs():
    status = request.args.get("status")
    server_id = request.args.get("server_id")
    q = Job.query
    if status:
        q = q.filter_by(status=status.upper())
    if server_id:
        q = q.filter_by(server_id=int(server_id))
    items = q.order_by(Job.id.desc()).limit(200).all()
    return jsonify([_job_to_dict(x) for x in items])


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
    j.status = "PENDING"
    j.run_after = None
    j.locked_at = None
    j.finished_at = None
    j.last_error = None
    db.session.commit()
    return jsonify(_job_to_dict(j))

