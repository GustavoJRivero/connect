"""
API CRUD de planes de servicio.

Endpoints:
  GET    /api/plans          – Listar planes
  POST   /api/plans          – Crear plan
  PUT    /api/plans/<id>     – Editar plan
  DELETE /api/plans/<id>     – Eliminar plan (solo si no tiene conexiones)
"""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from ..extensions import db
from ..models.plan import Plan
from ..models.connection import Connection
from ..logging_utils import slog

bp = Blueprint("plans", __name__, url_prefix="/api/plans")


def _connections_count_for_plan(p: Plan) -> int:
    """Las conexiones referencian el plan por `plan_profile` (nombre profile Mikrotik), no por FK."""
    return Connection.query.filter(Connection.plan_profile == p.profile).count()


def _plan_to_dict(p: Plan) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "profile": p.profile,
        "download_mbps": p.download_mbps,
        "upload_mbps": p.upload_mbps,
        "price": str(p.price),
        "iva_percent": str(p.iva_percent),
        "price_net": str(p.price_net),
        "price_with_iva": str(p.price_with_iva),
        "iva_amount": str(p.iva_amount),
        "is_active": p.is_active,
        "connections_count": _connections_count_for_plan(p),
    }


@bp.get("")
@jwt_required(optional=True)
def list_plans():
    """Listar todos los planes."""
    only_active = request.args.get("active_only", "").lower() in ("1", "true", "yes")
    q = Plan.query
    if only_active:
        q = q.filter_by(is_active=True)
    plans = q.order_by(Plan.download_mbps.asc()).all()
    return jsonify([_plan_to_dict(p) for p in plans])


@bp.post("")
@jwt_required(optional=True)
def create_plan():
    """
    Crear un plan.

    Body:
    {
      "name": "50 Megas",
      "profile": "50M",
      "download_mbps": 50,
      "upload_mbps": 10,
      "price": 18150,
      "iva_percent": 21
    }

    `price` es el monto final (IVA incluido) que paga el cliente.
    """
    data = request.get_json(force=True) or {}
    name = (data.get("name") or "").strip()
    profile = (data.get("profile") or "").strip()

    if not name:
        return jsonify({"error": "name_required"}), 400
    if not profile:
        return jsonify({"error": "profile_required"}), 400

    existing = Plan.query.filter_by(profile=profile).first()
    if existing:
        return jsonify({"error": "profile_already_exists", "plan_id": existing.id}), 409

    p = Plan(
        name=name,
        profile=profile,
        download_mbps=int(data.get("download_mbps") or 0),
        upload_mbps=int(data.get("upload_mbps") or 0),
        price=data.get("price", 0),
        iva_percent=data.get("iva_percent", 21),
        is_active=data.get("is_active", True),
    )
    db.session.add(p)
    db.session.commit()

    slog(
        module="SYSTEM",
        action="PLAN_CREATED",
        message=f"Plan creado: {p.name} ({p.profile})",
        details={
            "plan_id": p.id,
            "name": p.name,
            "profile": p.profile,
            "download_mbps": p.download_mbps,
            "upload_mbps": p.upload_mbps,
            "price": str(p.price),
            "iva_percent": str(p.iva_percent),
        },
        ref_id=p.id,
        ref_type="plan",
    )

    return jsonify(_plan_to_dict(p)), 201


@bp.put("/<int:plan_id>")
@jwt_required(optional=True)
def update_plan(plan_id: int):
    """Editar un plan."""
    data = request.get_json(force=True) or {}
    p = Plan.query.get_or_404(plan_id)

    if "name" in data:
        p.name = (data["name"] or "").strip() or p.name
    if "profile" in data:
        new_profile = (data["profile"] or "").strip()
        if new_profile and new_profile != p.profile:
            dup = Plan.query.filter_by(profile=new_profile).first()
            if dup and dup.id != p.id:
                return jsonify({"error": "profile_already_exists", "plan_id": dup.id}), 409
            p.profile = new_profile
    if "download_mbps" in data:
        p.download_mbps = int(data["download_mbps"] or 0)
    if "upload_mbps" in data:
        p.upload_mbps = int(data["upload_mbps"] or 0)
    if "price" in data:
        p.price = data["price"]
    if "iva_percent" in data:
        p.iva_percent = data["iva_percent"]
    if "is_active" in data:
        p.is_active = bool(data["is_active"])

    db.session.commit()

    slog(
        module="SYSTEM",
        action="PLAN_UPDATED",
        message=f"Plan actualizado: {p.name} ({p.profile})",
        details={"plan_id": p.id, "changes": data},
        ref_id=p.id,
        ref_type="plan",
    )

    return jsonify(_plan_to_dict(p))


@bp.delete("/<int:plan_id>")
@jwt_required(optional=True)
def delete_plan(plan_id: int):
    """Eliminar plan (solo si no tiene conexiones asignadas)."""
    p = Plan.query.get_or_404(plan_id)
    conn_count = _connections_count_for_plan(p)
    if conn_count > 0:
        return jsonify({
            "error": "plan_has_connections",
            "connections_count": conn_count,
            "message": f"El plan tiene {conn_count} conexión(es) asignada(s). Reasignalas antes de eliminar.",
        }), 409

    name = p.name
    profile = p.profile
    db.session.delete(p)
    db.session.commit()

    slog(
        module="SYSTEM",
        action="PLAN_DELETED",
        message=f"Plan eliminado: {name} ({profile})",
        details={"plan_id": plan_id},
        ref_id=plan_id,
        ref_type="plan",
    )

    return jsonify({"status": "deleted", "plan_id": plan_id})
