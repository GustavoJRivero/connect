from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import case, func, or_

from ..extensions import db
from ..mikrotik.ros_client import MikrotikRosClient
from ..models.client import Client
from ..models.connection import Connection
from ..models.mikrotik_server import MikrotikServer
from ..models.complaint import Complaint
from ..models.invoice import Invoice
from ..models.payment import Payment, PaymentAllocation
from ..network.ip_pool import PoolError, resolve_ip_for_connection
from ..tasks.queue import JOB_MT_CREATE_PPP_SECRET, JOB_MT_DELETE_PPP_SECRET, JOB_MT_SET_PPP_PROFILE, enqueue_job

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
    # Estado de servicios (conexiones)
    if getattr(c, "status", "ACTIVE") == "RETIRED":
        services_status = "RETIRED"
    else:
        # Regla: si al menos una conexión está CUT => cliente SUSPENDED
        any_cut = any(x.status == "CUT" for x in (c.connections or []))
        services_status = "SUSPENDED" if any_cut else "ACTIVE"
    server_ids = sorted({int(x.server_id) for x in (c.connections or []) if getattr(x, "server_id", None)})
    server_map = {}
    if server_ids:
        rows = MikrotikServer.query.filter(MikrotikServer.id.in_(server_ids)).all()
        server_map = {int(s.id): s.name for s in rows}

    connections_out = []
    for x in c.connections:
        sid = int(x.server_id) if getattr(x, "server_id", None) else None
        connections_out.append(
            {
                "id": x.id,
                "server_id": getattr(x, "server_id", None),
                "server_name": (server_map.get(sid) if sid else None),
                "service_address": x.service_address,
                "location": x.location,
                "plan_profile": x.plan_profile,
                "status": x.status,
                "status_ui": ("Suspend" if x.status == "CUT" else "Active"),
                "mikrotik_profile": x.mikrotik_profile,
                "pppoe_name": x.pppoe_name(),
                "pppoe_username": x.pppoe_name(),
                "pppoe_password": x.pppoe_password(),
                "ip": getattr(x, "ip", None),
                "ip_is_fixed": bool(getattr(x, "ip_is_fixed", False)),
                "last_uptime": getattr(x, "last_uptime", None),
                "last_connected_at": x.last_connected_at.isoformat() if getattr(x, "last_connected_at", None) else None,
                "last_disconnected_at": x.last_disconnected_at.isoformat() if getattr(x, "last_disconnected_at", None) else None,
                "last_seen_at": x.last_seen_at.isoformat() if getattr(x, "last_seen_at", None) else None,
            }
        )

    return {
        "id": c.id,
        "kind": c.kind,
        "status": getattr(c, "status", "ACTIVE"),
        "services_status": services_status,
        "full_name": c.full_name,
        "dni": c.dni,
        "cuit": c.cuit,
        "phone": c.phone,
        "email": c.email,
        "address": c.address,
        "is_active": c.is_active,
        "first_service_address": first_conn.service_address if first_conn else None,
        "debt_total": None,  # se completa en list_clients/get_client
        "connections": connections_out,
    }


def _client_to_list_dict(
    c: Client,
    *,
    address,
    connections_count: int,
    debt_total: str,
    active_connections: int,
    cut_connections: int,
) -> dict:
    if getattr(c, "status", "ACTIVE") == "RETIRED":
        services_status = "RETIRED"
    else:
        # Regla: si al menos una conexión está CUT => cliente SUSPENDED
        services_status = "SUSPENDED" if int(cut_connections or 0) > 0 else "ACTIVE"
    return {
        "id": c.id,
        "kind": c.kind,
        "status": getattr(c, "status", "ACTIVE"),
        "full_name": c.full_name,
        "phone": c.phone,
        "email": c.email,
        "address": address,
        "debt_total": debt_total,
        "connections_count": int(connections_count or 0),
        "services_status": services_status,
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

    connections_count_sq = (
        db.session.query(func.count(Connection.id))
        .filter(Connection.client_id == Client.id)
        .correlate(Client)
        .scalar_subquery()
    )

    active_count_sq = (
        db.session.query(func.count(Connection.id))
        .filter(Connection.client_id == Client.id)
        .filter(Connection.status == "ACTIVE")
        .correlate(Client)
        .scalar_subquery()
    )
    cut_count_sq = (
        db.session.query(func.count(Connection.id))
        .filter(Connection.client_id == Client.id)
        .filter(Connection.status == "CUT")
        .correlate(Client)
        .scalar_subquery()
    )

    services_rank_sq = case(
        (Client.status == "RETIRED", -1),
        # Regla: si hay alguna CUT => SUSPENDED
        (cut_count_sq > 0, 1),
        else_=2,  # ACTIVE
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
            Client.address.ilike(like),
            Client.connections.any(Connection.service_address.ilike(like)),
        ]
        if q.isdigit():
            ors.append(Client.id == int(q))
        base_filters.append(or_(*ors))

    total = db.session.query(func.count(Client.id)).filter(*base_filters).scalar() or 0

    query = (
        db.session.query(
            Client,
            connections_count_sq.label("connections_count"),
            active_count_sq.label("active_connections"),
            cut_count_sq.label("cut_connections"),
            debt_total_sq.label("debt_total"),
        )
        .filter(*base_filters)
    )

    sort_map = {
        "id": Client.id,
        "full_name": Client.full_name,
        "address": Client.address,
        "phone": Client.phone,
        "email": Client.email,
        "debt_total": debt_total_sq,
        "connections_count": connections_count_sq,
        "services_status": services_rank_sq,
    }
    sort_expr = sort_map.get(sort_by) if sort_by in sort_map else Client.id
    if sort_dir not in ("asc", "desc"):
        sort_dir = "desc"

    order_expr = sort_expr.asc() if sort_dir == "asc" else sort_expr.desc()
    query = query.order_by(order_expr, Client.id.desc())

    rows = query.offset(offset).limit(limit).all()

    items = []
    for c, connections_count, active_connections, cut_connections, debt_total in rows:
        items.append(
            _client_to_list_dict(
                c,
                address=c.address,
                connections_count=int(connections_count or 0),
                debt_total=str(debt_total or 0),
                active_connections=int(active_connections or 0),
                cut_connections=int(cut_connections or 0),
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
        status="ACTIVE",
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
        requested_ip = ((conn.get("ip") or "").strip() or None)
        try:
            ip, ip_autoassigned = resolve_ip_for_connection(
                server_id=int(conn.get("server_id")) if conn.get("server_id") else None,
                requested_ip=requested_ip,
            )
        except PoolError as e:
            payload = {"error": e.code}
            payload.update(e.extra or {})
            status = 400 if e.code in ("ip_invalid", "ip_already_taken") else 409
            return jsonify(payload), status
        pppoe_username = (conn.get("pppoe_username") or "").strip() or None
        pppoe_password = (conn.get("pppoe_password") or "").strip() or None

        c.connections.append(
            Connection(
                service_address=(conn.get("service_address") or None),
                location=(conn.get("location") or None),
                server_id=(int(conn.get("server_id")) if conn.get("server_id") else None),
                ip=ip,
                # ip_is_fixed = la IP la puso el usuario manualmente (no salió del pool).
                ip_is_fixed=bool(ip) and not ip_autoassigned,
                pppoe_username=pppoe_username,
                pppoe_password_value=pppoe_password,
                plan_profile=plan_profile,
                status="ACTIVE",
                mikrotik_profile=plan_profile,
            )
        )

    db.session.add(c)
    db.session.commit()  # para asignar IDs a connections

    # Default credentials si no vinieron (por defecto = id)
    for x in c.connections:
        if not x.pppoe_username:
            x.pppoe_username = str(x.id)
        if not x.pppoe_password_value:
            x.pppoe_password_value = str(x.id)
    db.session.commit()

    jobs = []
    if provision_mikrotik:
        for x in c.connections:
            j = enqueue_job(
                job_type=JOB_MT_CREATE_PPP_SECRET,
                payload={
                    "name": x.pppoe_name(),
                    "password": x.pppoe_password(),
                    "profile": x.plan_profile,
                    "remote_address": (x.ip or None),
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

    # Obtener IDs de registros dependientes
    conn_ids = [x.id for x in (c.connections or [])]
    invoice_ids = [i.id for i in Invoice.query.filter_by(client_id=client_id).all()]
    payment_ids = [p.id for p in Payment.query.filter_by(client_id=client_id).all()]

    # 1. payment_allocations (depende de invoices y payments)
    if invoice_ids:
        PaymentAllocation.query.filter(PaymentAllocation.invoice_id.in_(invoice_ids)).delete(synchronize_session=False)
    if payment_ids:
        PaymentAllocation.query.filter(PaymentAllocation.payment_id.in_(payment_ids)).delete(synchronize_session=False)

    # 2. complaints (depende de connections y clients)
    Complaint.query.filter_by(client_id=client_id).delete(synchronize_session=False)

    # 3. invoices (depende de connections y clients)
    Invoice.query.filter_by(client_id=client_id).delete(synchronize_session=False)

    # 4. payments (depende de clients)
    Payment.query.filter_by(client_id=client_id).delete(synchronize_session=False)

    # 5. client + connections (cascade de SQLAlchemy)
    db.session.delete(c)
    db.session.commit()

    jobs = []
    if provision_mikrotik:
        for item in secrets:
            j = enqueue_job(job_type=JOB_MT_DELETE_PPP_SECRET, payload={"name": item["name"]}, server_id=item["server_id"])
            jobs.append({"job_id": int(j.id), "type": j.job_type, "name": item["name"], "server_id": item["server_id"]})

    return jsonify({"status": "deleted", "jobs": jobs})


@bp.post("/<int:client_id>/suspend_services")
@jwt_required(optional=True)
def suspend_services(client_id: int):
    """
    Suspende manualmente TODOS los servicios (conexiones) del cliente:
    - marca status CUT
    - aplica mikrotik_profile = suspended (o el que se pase)
    - encola jobs para setear el profile en Mikrotik (por server_id)
    """
    data = request.get_json(silent=True) or {}
    cut_profile = (data.get("cut_profile") or "suspended").strip()

    c = Client.query.get_or_404(client_id)
    conns = list(c.connections or [])
    if not conns:
        return jsonify({"status": "ok", "client_id": int(c.id), "jobs": []})

    for x in conns:
        x.status = "CUT"
        x.mikrotik_profile = cut_profile

    db.session.commit()

    jobs = []
    for x in conns:
        j = enqueue_job(
            job_type=JOB_MT_SET_PPP_PROFILE,
            payload={"name": x.pppoe_name(), "profile": cut_profile},
            server_id=(int(x.server_id) if getattr(x, "server_id", None) else None),
        )
        jobs.append({"job_id": int(j.id), "type": j.job_type, "connection_id": int(x.id), "server_id": getattr(x, "server_id", None)})

    return jsonify({"status": "suspended", "client_id": int(c.id), "cut_profile": cut_profile, "jobs": jobs})

