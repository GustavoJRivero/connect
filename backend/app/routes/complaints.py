from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from ..extensions import db
from ..models.complaint import Complaint
from ..models.connection import Connection
from ..timezone import iso_utc

bp = Blueprint("complaints", __name__, url_prefix="/api/complaints")


def _human_duration(seconds: int) -> str:
    if seconds < 0:
        seconds = 0
    mins = seconds // 60
    hrs = mins // 60
    days = hrs // 24
    mins = mins % 60
    hrs = hrs % 24
    if days:
        return f"{days}d {hrs}h {mins}m"
    if hrs:
        return f"{hrs}h {mins}m"
    return f"{mins}m"


def _complaint_to_dict(x: Complaint) -> dict:
    solved_seconds = None
    solved_human = None
    if x.solved_at:
        solved_seconds = int((x.solved_at - x.created_at).total_seconds())
        solved_human = _human_duration(solved_seconds)
    return {
        "id": x.id,
        "client_id": x.client_id,
        "connection_id": x.connection_id,
        "created_at": iso_utc(x.created_at),
        "kind": x.kind,
        "detail": x.detail,
        "status": x.status,
        "solved_at": iso_utc(x.solved_at),
        "solved_seconds": solved_seconds,
        "solved_human": solved_human,
    }


@bp.get("")
@jwt_required(optional=True)
def list_complaints():
    client_id = request.args.get("client_id")
    q = Complaint.query
    if client_id:
        q = q.filter_by(client_id=int(client_id))
    items = q.order_by(Complaint.id.desc()).limit(500).all()
    return jsonify([_complaint_to_dict(x) for x in items])


@bp.post("")
@jwt_required(optional=True)
def create_complaint():
    """
    Body:
    {
      "client_id": 1,
      "connection_id": 10,
      "kind": "BILLING" | "TECH",
      "detail": "...",
      "status": "TODO" | "WIP" | "SOLVED" // opcional
    }
    """
    data = request.get_json(force=True) or {}
    client_id = data.get("client_id")
    connection_id = data.get("connection_id")
    if not client_id:
        return jsonify({"error": "client_id_required"}), 400
    if not connection_id:
        return jsonify({"error": "connection_id_required"}), 400

    # Validar que la conexión pertenece al cliente
    conn = Connection.query.get(int(connection_id))
    if not conn or int(conn.client_id) != int(client_id):
        return jsonify({"error": "connection_not_found_for_client"}), 404

    kind = (data.get("kind") or "TECH").upper().strip()
    if kind not in ("BILLING", "TECH"):
        return jsonify({"error": "invalid_kind"}), 400

    status = (data.get("status") or "TODO").upper().strip()
    if status not in ("TODO", "WIP", "SOLVED"):
        return jsonify({"error": "invalid_status"}), 400

    detail = (data.get("detail") or "").strip()
    if not detail:
        return jsonify({"error": "detail_required"}), 400

    solved_at = None
    if status == "SOLVED":
        solved_at = datetime.utcnow()

    x = Complaint(
        client_id=int(client_id),
        connection_id=int(connection_id),
        kind=kind,
        detail=detail,
        status=status,
        solved_at=solved_at,
    )
    db.session.add(x)
    db.session.commit()
    return jsonify(_complaint_to_dict(x)), 201


@bp.put("/<int:complaint_id>")
@jwt_required(optional=True)
def update_complaint(complaint_id: int):
    """
    Body (parcial):
    {
      "kind": "BILLING" | "TECH",
      "detail": "...",
      "status": "TODO" | "WIP" | "SOLVED"
    }
    """
    x = Complaint.query.get_or_404(complaint_id)
    data = request.get_json(force=True) or {}

    if "kind" in data:
        kind = (data.get("kind") or "").upper().strip()
        if kind not in ("BILLING", "TECH"):
            return jsonify({"error": "invalid_kind"}), 400
        x.kind = kind

    if "detail" in data:
        detail = (data.get("detail") or "").strip()
        if not detail:
            return jsonify({"error": "detail_required"}), 400
        x.detail = detail

    if "status" in data:
        status = (data.get("status") or "").upper().strip()
        if status not in ("TODO", "WIP", "SOLVED"):
            return jsonify({"error": "invalid_status"}), 400
        # Regla: SOLVED no puede volver atrás
        if x.status == "SOLVED" and status != "SOLVED":
            return jsonify({"error": "already_solved"}), 409
        x.status = status
        if status == "SOLVED" and not x.solved_at:
            x.solved_at = datetime.utcnow()
        if status != "SOLVED":
            x.solved_at = None

    db.session.commit()
    return jsonify(_complaint_to_dict(x))

