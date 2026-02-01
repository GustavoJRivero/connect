import ipaddress

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import case, func, or_

from ..extensions import db
from ..mikrotik.ros_client import MikrotikRosClient
from ..models.client import Client
from ..models.connection import Connection
from ..models.invoice import Invoice
from ..tasks.queue import JOB_MT_CREATE_PPP_SECRET, JOB_MT_DELETE_PPP_SECRET, enqueue_job

bp = Blueprint("clients", __name__, url_prefix="/api/clients")


def _get_mt_from_app():
    # Lazy import to avoid circulars
    from flask import current_app

    host = current_app.config.get("MIKROTIK_HOST")
    user = current_app.config.get("MIKROTIK_USER")
    password = current_app.config.get("MIKROTIK_PASS")
    port = current_app.config.get("MIKROTIK_PORT", 8728)

    if not host or not user or not password:
        return None
    return MikrotikRosClient(host=host, user=user, password=password, port=port)


def _client_to_dict(c: Client) -> dict:
    first_conn = c.connections[0] if c.connections else None
    return {
        "id": c.id,
        "kind": c.kind,
        "full_name": c.full_name,
        "dni": c.dni,
        "cuit": c.cuit,
        "phone": c.phone,
        "email": c.email,
        "address": c.address,
        "is_active": c.is_active,
        "first_service_address": first_conn.service_address if first_conn else None,
        "debt_total": None,  # se completa en list_clients/get_client
        "connections": [
            {
                "id": x.id,
                "server_id": getattr(x, "server_id", None),
                "service_address": x.service_address,
                "location": x.location,
                "plan_profile": x.plan_profile,
                "status": x.status,
                "mikrotik_profile": x.mikrotik_profile,
                "pppoe_name": x.pppoe_name(),
                "ip": getattr(x, "ip", None),
                "ip_is_fixed": bool(getattr(x, "ip_is_fixed", False)),
                "last_uptime": getattr(x, "last_uptime", None),
                "last_connected_at": x.last_connected_at.isoformat() if getattr(x, "last_connected_at", None) else None,
                "last_disconnected_at": x.last_disconnected_at.isoformat() if getattr(x, "last_disconnected_at", None) else None,
                "last_seen_at": x.last_seen_at.isoformat() if getattr(x, "last_seen_at", None) else None,
            }
            for x in c.connections
        ],
    }


def _client_to_list_dict(
    c: Client,
    *,
    first_service_address,
    connections_count: int,
    debt_total: str,
) -> dict:
    return {
        "id": c.id,
        "kind": c.kind,
        "full_name": c.full_name,
        "phone": c.phone,
        "email": c.email,
        "first_service_address": first_service_address,
        "debt_total": debt_total,
        "connections_count": int(connections_count or 0),
    }


@bp.get("")
@jwt_required(optional=True)
def list_clients():
    # Backward-compatible: si no vienen params, devolvemos el listado completo (legacy)
    if not request.args:
        items = Client.query.order_by(Client.id.desc()).all()
        ids = [int(x.id) for x in items]

        debt_map = {}
        if ids:
            balance_expr = case(
                (Invoice.total > Invoice.paid_total, Invoice.total - Invoice.paid_total),
                else_=0,
            )
            rows = (
                db.session.query(
                    Invoice.client_id,
                    func.coalesce(func.sum(balance_expr), 0),
                )
                .filter(Invoice.client_id.in_(ids))
                .filter(Invoice.is_deleted.is_(False))
                .filter(Invoice.status.in_(["ISSUED", "DRAFT"]))
                .group_by(Invoice.client_id)
                .all()
            )
            debt_map = {int(cid): str(total) for cid, total in rows}

        out = []
        for c in items:
            d = _client_to_dict(c)
            d["debt_total"] = debt_map.get(int(c.id), "0")
            out.append(d)
        return jsonify(out)

    # Paginado/orden server-side
    q = (request.args.get("q") or "").strip()
    sort_by = (request.args.get("sort_by") or "id").strip()
    sort_dir = (request.args.get("sort_dir") or "desc").strip().lower()
    try:
        limit = int(request.args.get("limit") or 10)
    except Exception:
        limit = 10
    try:
        offset = int(request.args.get("offset") or 0)
    except Exception:
        offset = 0

    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    balance_expr = case(
        (Invoice.total > Invoice.paid_total, Invoice.total - Invoice.paid_total),
        else_=0,
    )

    first_addr_sq = (
        db.session.query(Connection.service_address)
        .filter(Connection.client_id == Client.id)
        .order_by(Connection.id.asc())
        .limit(1)
        .correlate(Client)
        .scalar_subquery()
    )

    connections_count_sq = (
        db.session.query(func.count(Connection.id))
        .filter(Connection.client_id == Client.id)
        .correlate(Client)
        .scalar_subquery()
    )

    debt_total_sq = (
        db.session.query(func.coalesce(func.sum(balance_expr), 0))
        .filter(Invoice.client_id == Client.id)
        .filter(Invoice.is_deleted.is_(False))
        .filter(Invoice.status.in_(["ISSUED", "DRAFT"]))
        .correlate(Client)
        .scalar_subquery()
    )

    base_filters = []
    if q:
        like = f"%{q}%"
        ors = [
            Client.full_name.ilike(like),
            Client.phone.ilike(like),
            Client.email.ilike(like),
            Client.dni.ilike(like),
            Client.cuit.ilike(like),
            Client.connections.any(Connection.service_address.ilike(like)),
        ]
        if q.isdigit():
            ors.append(Client.id == int(q))
        base_filters.append(or_(*ors))

    total = db.session.query(func.count(Client.id)).filter(*base_filters).scalar() or 0

    query = (
        db.session.query(
            Client,
            first_addr_sq.label("first_service_address"),
            connections_count_sq.label("connections_count"),
            debt_total_sq.label("debt_total"),
        )
        .filter(*base_filters)
    )

    sort_map = {
        "id": Client.id,
        "full_name": Client.full_name,
        "first_service_address": first_addr_sq,
        "phone": Client.phone,
        "email": Client.email,
        "debt_total": debt_total_sq,
        "connections_count": connections_count_sq,
    }
    sort_expr = sort_map.get(sort_by) or Client.id
    if sort_dir not in ("asc", "desc"):
        sort_dir = "desc"

    order_expr = sort_expr.asc() if sort_dir == "asc" else sort_expr.desc()
    query = query.order_by(order_expr, Client.id.desc())

    rows = query.offset(offset).limit(limit).all()

    items = []
    for c, first_service_address, connections_count, debt_total in rows:
        items.append(
            _client_to_list_dict(
                c,
                first_service_address=first_service_address,
                connections_count=int(connections_count or 0),
                debt_total=str(debt_total or 0),
            )
        )

    return jsonify(
        {
            "items": items,
            "total": int(total),
            "limit": int(limit),
            "offset": int(offset),
            "sort_by": sort_by,
            "sort_dir": sort_dir,
            "q": q,
        }
    )


@bp.get("/<int:client_id>")
@jwt_required(optional=True)
def get_client(client_id: int):
    c = Client.query.get_or_404(client_id)
    balance_expr = case(
        (Invoice.total > Invoice.paid_total, Invoice.total - Invoice.paid_total),
        else_=0,
    )
    debt_total = (
        db.session.query(func.coalesce(func.sum(balance_expr), 0))
        .filter(Invoice.client_id == int(client_id))
        .filter(Invoice.is_deleted.is_(False))
        .filter(Invoice.status.in_(["ISSUED", "DRAFT"]))
        .scalar()
    )
    d = _client_to_dict(c)
    d["debt_total"] = str(debt_total or 0)
    return jsonify(d)


@bp.post("")
@jwt_required(optional=True)
def create_client():
    data = request.get_json(force=True) or {}
    provision_mikrotik = bool(data.get("provision_mikrotik", True))

    kind = (data.get("kind") or "PERSON").upper()
    if kind not in ("PERSON", "COMPANY"):
        return jsonify({"error": "invalid_kind"}), 400

    dni = (data.get("dni") or None)
    cuit = (data.get("cuit") or None)
    if dni:
        exists = Client.query.filter(Client.dni == str(dni)).first()
        if exists:
            return jsonify({"error": "dni_already_exists", "client_id": int(exists.id)}), 409
    if cuit:
        exists = Client.query.filter(Client.cuit == str(cuit)).first()
        if exists:
            return jsonify({"error": "cuit_already_exists", "client_id": int(exists.id)}), 409

    c = Client(
        kind=kind,
        full_name=(data.get("full_name") or "").strip(),
        dni=(str(dni) if dni else None),
        cuit=(str(cuit) if cuit else None),
        phone=(data.get("phone") or None),
        email=(data.get("email") or None),
        address=(data.get("address") or None),
        is_active=True,
    )
    if not c.full_name:
        return jsonify({"error": "full_name_required"}), 400

    conns = data.get("connections") or []
    if not isinstance(conns, list) or len(conns) == 0:
        return jsonify({"error": "connections_required"}), 400

    for conn in conns:
        plan_profile = (conn.get("plan_profile") or "").strip()
        if not plan_profile:
            return jsonify({"error": "plan_profile_required"}), 400
        ip = ((conn.get("ip") or "").strip() or None)
        if ip:
            try:
                ipaddress.ip_address(ip)
            except Exception:
                return jsonify({"error": "ip_invalid"}), 400
        c.connections.append(
            Connection(
                service_address=(conn.get("service_address") or None),
                location=(conn.get("location") or None),
                server_id=(int(conn.get("server_id")) if conn.get("server_id") else None),
                ip=ip,
                ip_is_fixed=bool(ip),
                plan_profile=plan_profile,
                status="ACTIVE",
                mikrotik_profile=plan_profile,
            )
        )

    db.session.add(c)
    db.session.commit()  # para asignar IDs a connections (pppoe_name = id)

    jobs = []
    if provision_mikrotik:
        for x in c.connections:
            j = enqueue_job(
                job_type=JOB_MT_CREATE_PPP_SECRET,
                payload={
                    "name": x.pppoe_name(),
                    "password": x.pppoe_password(),
                    "profile": x.plan_profile,
                    "remote_address": (x.ip if x.ip_is_fixed else None),
                },
                server_id=(int(x.server_id) if x.server_id else None),
            )
            jobs.append({"job_id": int(j.id), "connection_id": int(x.id), "type": j.job_type})

    return jsonify({"client": _client_to_dict(c), "jobs": jobs}), 201


@bp.put("/<int:client_id>")
@jwt_required(optional=True)
def update_client(client_id: int):
    c = Client.query.get_or_404(client_id)
    data = request.get_json(force=True) or {}

    if "kind" in data:
        kind = (data.get("kind") or "").upper()
        if kind not in ("PERSON", "COMPANY"):
            return jsonify({"error": "invalid_kind"}), 400
        c.kind = kind

    if "full_name" in data:
        c.full_name = (data.get("full_name") or "").strip()
        if not c.full_name:
            return jsonify({"error": "full_name_required"}), 400

    if "dni" in data:
        new_dni = data.get("dni") or None
        if new_dni:
            exists = Client.query.filter(Client.dni == str(new_dni)).filter(Client.id != c.id).first()
            if exists:
                return jsonify({"error": "dni_already_exists", "client_id": int(exists.id)}), 409
        c.dni = str(new_dni) if new_dni else None
    if "cuit" in data:
        new_cuit = data.get("cuit") or None
        if new_cuit:
            exists = Client.query.filter(Client.cuit == str(new_cuit)).filter(Client.id != c.id).first()
            if exists:
                return jsonify({"error": "cuit_already_exists", "client_id": int(exists.id)}), 409
        c.cuit = str(new_cuit) if new_cuit else None
    if "phone" in data:
        c.phone = data.get("phone") or None
    if "email" in data:
        c.email = data.get("email") or None
    if "address" in data:
        c.address = data.get("address") or None
    if "is_active" in data:
        c.is_active = bool(data.get("is_active"))

    db.session.commit()
    return jsonify(_client_to_dict(c))


@bp.delete("/<int:client_id>")
@jwt_required(optional=True)
def delete_client(client_id: int):
    provision_mikrotik = request.args.get("provision_mikrotik", "true").lower() != "false"
    c = Client.query.get_or_404(client_id)

    # Capturar secrets antes de borrar (para poder encolar luego)
    secrets = [{"name": x.pppoe_name(), "server_id": int(x.server_id) if x.server_id else None} for x in (c.connections or [])]

    db.session.delete(c)
    db.session.commit()

    jobs = []
    if provision_mikrotik:
        for item in secrets:
            j = enqueue_job(job_type=JOB_MT_DELETE_PPP_SECRET, payload={"name": item["name"]}, server_id=item["server_id"])
            jobs.append({"job_id": int(j.id), "type": j.job_type, "name": item["name"], "server_id": item["server_id"]})

    return jsonify({"status": "deleted", "jobs": jobs})

