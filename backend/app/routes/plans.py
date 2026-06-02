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
from ..models.mikrotik_server import MikrotikServer
from ..logging_utils import slog
from ..tasks.queue import (
    enqueue_job,
    JOB_MT_CREATE_PPP_PROFILE,
    JOB_MT_UPDATE_PPP_PROFILE,
    JOB_MT_DELETE_PPP_PROFILE,
)

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
        "rate_limit": p.rate_limit or "",
        "computed_rate_limit": p.computed_rate_limit(),
        "price": str(p.price),
        "iva_percent": str(p.iva_percent),
        "price_net": str(p.price_net),
        "price_with_iva": str(p.price_with_iva),
        "iva_amount": str(p.iva_amount),
        "is_active": p.is_active,
        "connections_count": _connections_count_for_plan(p),
    }


def _all_server_ids() -> list:
    """IDs de todos los Mikrotik registrados (a los que se sincroniza el plan)."""
    return [int(s.id) for s in MikrotikServer.query.with_entities(MikrotikServer.id).all()]


def _enqueue_profile_create(p: Plan) -> int:
    """Encola en cada Mikrotik la creación del /ppp/profile correspondiente al plan."""
    server_ids = _all_server_ids()
    payload = {"name": p.profile, "rate_limit": p.computed_rate_limit()}
    for sid in server_ids:
        enqueue_job(job_type=JOB_MT_CREATE_PPP_PROFILE, payload=payload, server_id=sid)
    return len(server_ids)


def _enqueue_profile_update(p: Plan, *, old_profile: str) -> int:
    """Encola en cada Mikrotik la actualización (rename y/o rate-limit) del profile."""
    server_ids = _all_server_ids()
    payload = {
        "old_name": old_profile or p.profile,
        "name": p.profile,
        "rate_limit": p.computed_rate_limit(),
    }
    for sid in server_ids:
        enqueue_job(job_type=JOB_MT_UPDATE_PPP_PROFILE, payload=payload, server_id=sid)
    return len(server_ids)


def _enqueue_profile_delete(profile_name: str) -> int:
    """Encola en cada Mikrotik la eliminación del /ppp/profile."""
    server_ids = _all_server_ids()
    payload = {"name": profile_name}
    for sid in server_ids:
        enqueue_job(job_type=JOB_MT_DELETE_PPP_PROFILE, payload=payload, server_id=sid)
    return len(server_ids)


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
      "rate_limit": "50M/10M 75M/15M 40M/8M 30/30 8 5M/1M",   // opcional, se manda tal cual a /ppp/profile
      "price": 18150,
      "iva_percent": 21
    }

    `price` es el monto final (IVA incluido) que paga el cliente.
    Si `rate_limit` se omite o queda vacío, en el router se usa "{upload}M/{download}M".
    Tras crear el plan se encola la creación del /ppp/profile en cada Mikrotik registrado.
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

    rate_limit_raw = data.get("rate_limit")
    rate_limit = (rate_limit_raw or "").strip() if isinstance(rate_limit_raw, str) else ""

    p = Plan(
        name=name,
        profile=profile,
        download_mbps=int(data.get("download_mbps") or 0),
        upload_mbps=int(data.get("upload_mbps") or 0),
        rate_limit=rate_limit or None,
        price=data.get("price", 0),
        iva_percent=data.get("iva_percent", 21),
        is_active=data.get("is_active", True),
    )
    db.session.add(p)
    db.session.commit()

    queued = _enqueue_profile_create(p)

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
            "rate_limit": p.computed_rate_limit(),
            "price": str(p.price),
            "iva_percent": str(p.iva_percent),
            "mt_jobs_queued": queued,
        },
        ref_id=p.id,
        ref_type="plan",
    )

    return jsonify(_plan_to_dict(p)), 201


@bp.put("/<int:plan_id>")
@jwt_required(optional=True)
def update_plan(plan_id: int):
    """Editar un plan. Sincroniza el /ppp/profile en cada Mikrotik registrado."""
    data = request.get_json(force=True) or {}
    p = Plan.query.get_or_404(plan_id)

    old_profile = p.profile

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
    if "rate_limit" in data:
        rl_raw = data["rate_limit"]
        rl = (rl_raw or "").strip() if isinstance(rl_raw, str) else ""
        p.rate_limit = rl or None
    if "price" in data:
        p.price = data["price"]
    if "iva_percent" in data:
        p.iva_percent = data["iva_percent"]
    if "is_active" in data:
        p.is_active = bool(data["is_active"])

    db.session.commit()

    queued = _enqueue_profile_update(p, old_profile=old_profile)

    slog(
        module="SYSTEM",
        action="PLAN_UPDATED",
        message=f"Plan actualizado: {p.name} ({p.profile})",
        details={
            "plan_id": p.id,
            "changes": data,
            "old_profile": old_profile,
            "new_profile": p.profile,
            "rate_limit": p.computed_rate_limit(),
            "mt_jobs_queued": queued,
        },
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

    queued = _enqueue_profile_delete(profile)

    slog(
        module="SYSTEM",
        action="PLAN_DELETED",
        message=f"Plan eliminado: {name} ({profile})",
        details={"plan_id": plan_id, "profile": profile, "mt_jobs_queued": queued},
        ref_id=plan_id,
        ref_type="plan",
    )

    return jsonify({"status": "deleted", "plan_id": plan_id})
