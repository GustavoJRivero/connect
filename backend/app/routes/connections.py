import ipaddress
from datetime import datetime
from typing import Optional

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from ..extensions import db
from ..models.client import Client
from ..models.connection import Connection
from ..models.mikrotik_server import MikrotikServer
from ..tasks.queue import (
    JOB_MT_CREATE_PPP_SECRET,
    JOB_MT_DELETE_PPP_SECRET,
    JOB_MT_SET_PPP_PROFILE,
    JOB_MT_SET_PPP_CREDENTIALS,
    JOB_MT_SET_PPP_REMOTE_ADDRESS,
    enqueue_job,
)

bp = Blueprint("connections", __name__, url_prefix="/api/connections")


def _iso(dt: Optional[datetime]):
    return dt.isoformat() if dt else None


def _parse_mt_datetime(v: Optional[str]) -> Optional[datetime]:
    if not v:
        return None
    s = str(v).strip()
    if not s or s.lower() in ("never", "0", "none"):
        return None
    # formatos comunes:
    # - 2026-01-31 10:32:11
    # - jan/31/2026 10:32:11
    try_formats = [
        "%Y-%m-%d %H:%M:%S",
        "%b/%d/%Y %H:%M:%S",
        "%b/%d/%Y %H:%M:%S.%f",
    ]
    # normaliza month abreviado: "jan/.." -> "Jan/.."
    if len(s) >= 3 and s[0:3].isalpha():
        s2 = s[0:3].title() + s[3:]
    else:
        s2 = s
    for fmt in try_formats:
        try:
            return datetime.strptime(s2, fmt)
        except Exception:
            continue
    return None


def _conn_to_dict(x: Connection) -> dict:
    status_ui = "Suspend" if x.status == "CUT" else "Active"
    server_name = None
    if getattr(x, "server_id", None):
        s = MikrotikServer.query.get(int(x.server_id))
        server_name = s.name if s else None
    return {
        "id": x.id,
        "client_id": x.client_id,
        "server_id": getattr(x, "server_id", None),
        "server_name": server_name,
        "service_address": x.service_address,
        "location": x.location,
        "plan_profile": x.plan_profile,
        "status": x.status,
        "status_ui": status_ui,
        "mikrotik_profile": x.mikrotik_profile,
        "pppoe_name": x.pppoe_name(),
        "pppoe_username": x.pppoe_name(),
        "pppoe_password": x.pppoe_password(),
        "ip": getattr(x, "ip", None),
        "ip_is_fixed": bool(getattr(x, "ip_is_fixed", False)),
        "last_uptime": getattr(x, "last_uptime", None),
        "last_connected_at": _iso(getattr(x, "last_connected_at", None)),
        "last_disconnected_at": _iso(getattr(x, "last_disconnected_at", None)),
        "last_seen_at": _iso(getattr(x, "last_seen_at", None)),
    }


@bp.post("")
@jwt_required(optional=True)
def create_connection():
    """
    Crea una conexión para un cliente existente y crea el PPPoE secret en Mikrotik.

    Body:
    {
      "client_id": 123,
      "service_address": "...",
      "plan_profile": "50M",
      "provision_mikrotik": true
    }
    """
    data = request.get_json(force=True) or {}
    provision_mikrotik = bool(data.get("provision_mikrotik", True))
    client_id = data.get("client_id")
    server_id = data.get("server_id")
    plan_profile = (data.get("plan_profile") or "").strip()
    ip = (data.get("ip") or "").strip() or None
    pppoe_username = (data.get("pppoe_username") or "").strip() or None
    pppoe_password = (data.get("pppoe_password") or "").strip() or None

    if ip:
        try:
            ipaddress.ip_address(ip)
        except Exception:
            return jsonify({"error": "ip_invalid"}), 400

    if not client_id:
        return jsonify({"error": "client_id_required"}), 400
    if not plan_profile:
        return jsonify({"error": "plan_profile_required"}), 400

    client = Client.query.get_or_404(int(client_id))
    # Si estaba retirado, al crear una nueva conexión vuelve a ACTIVE
    if getattr(client, "status", "ACTIVE") == "RETIRED":
        client.status = "ACTIVE"
        client.is_active = True

    billing_day = int(data.get("billing_day", 1))
    if billing_day < 1 or billing_day > 28:
        billing_day = 1
    prorate = data.get("prorate_first_month", True)
    if not isinstance(prorate, bool):
        prorate = str(prorate).lower() not in ("0", "false", "no")

    x = Connection(
        client_id=client.id,
        server_id=(int(server_id) if server_id else None),
        service_address=(data.get("service_address") or None),
        location=(data.get("location") or None),
        plan_profile=plan_profile,
        billing_day=billing_day,
        prorate_first_month=prorate,
        status="ACTIVE",
        mikrotik_profile=plan_profile,
        ip=ip,
        ip_is_fixed=bool(ip),
        pppoe_username=pppoe_username,
        pppoe_password_value=pppoe_password,
    )
    db.session.add(x)
    db.session.commit()  # asigna x.id (pppoe)

    # Default credentials si no vinieron
    if not x.pppoe_username:
        x.pppoe_username = str(x.id)
    if not x.pppoe_password_value:
        x.pppoe_password_value = str(x.id)
    db.session.commit()

    jobs = []
    if provision_mikrotik:
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
        jobs.append({"job_id": int(j.id), "type": j.job_type, "connection_id": int(x.id)})

    return jsonify({"connection": _conn_to_dict(x), "jobs": jobs}), 201


@bp.put("/<int:connection_id>")
@jwt_required(optional=True)
def update_connection(connection_id: int):
    """
    Edita datos de la conexión. Si cambia `plan_profile` puede sincronizar Mikrotik.
    """
    data = request.get_json(force=True) or {}
    sync_mikrotik = bool(data.get("sync_mikrotik", True))
    x = Connection.query.get_or_404(connection_id)
    old_name = x.pppoe_name()
    old_server_id = int(x.server_id) if x.server_id else None

    if "service_address" in data:
        x.service_address = data.get("service_address") or None
    if "location" in data:
        x.location = data.get("location") or None
    if "server_id" in data:
        x.server_id = int(data.get("server_id")) if data.get("server_id") else None

    ip_changed = False
    if "ip" in data:
        raw = (data.get("ip") or "").strip()
        if raw:
            try:
                ipaddress.ip_address(raw)
            except Exception:
                return jsonify({"error": "ip_invalid"}), 400
            x.ip = raw
            x.ip_is_fixed = True
        else:
            x.ip = None
            x.ip_is_fixed = False
        ip_changed = True

    creds_changed = False
    if "pppoe_username" in data:
        raw = (data.get("pppoe_username") or "").strip()
        x.pppoe_username = raw or str(x.id)
        creds_changed = True
    if "pppoe_password" in data:
        raw = (data.get("pppoe_password") or "").strip()
        x.pppoe_password_value = raw or str(x.id)
        creds_changed = True

    if "plan_profile" in data:
        plan_profile = (data.get("plan_profile") or "").strip()
        if not plan_profile:
            return jsonify({"error": "plan_profile_required"}), 400
        x.plan_profile = plan_profile
        # Si estaba ACTIVE, el profile en MT debería quedar igual al plan
        if x.status == "ACTIVE":
            x.mikrotik_profile = plan_profile

    db.session.commit()

    jobs = []

    # Si cambió el server, movemos el secret: delete en el viejo + create en el nuevo
    new_server_id = int(x.server_id) if x.server_id else None
    server_changed = ("server_id" in data) and (new_server_id != old_server_id)
    if sync_mikrotik and server_changed:
        if old_server_id:
            j = enqueue_job(
                job_type=JOB_MT_DELETE_PPP_SECRET,
                payload={"name": old_name},
                server_id=old_server_id,
            )
            jobs.append({"job_id": int(j.id), "type": j.job_type, "connection_id": int(x.id), "server_id": old_server_id})
        if new_server_id:
            j = enqueue_job(
                job_type=JOB_MT_CREATE_PPP_SECRET,
                payload={
                    "name": x.pppoe_name(),
                    "password": x.pppoe_password(),
                    "profile": x.plan_profile,
                    "remote_address": (x.ip if x.ip_is_fixed else None),
                },
                server_id=new_server_id,
            )
            jobs.append({"job_id": int(j.id), "type": j.job_type, "connection_id": int(x.id), "server_id": new_server_id})
        return jsonify({"connection": _conn_to_dict(x), "jobs": jobs})

    if sync_mikrotik and x.status == "ACTIVE" and "plan_profile" in data:
        j = enqueue_job(
            job_type=JOB_MT_SET_PPP_PROFILE,
            payload={"name": x.pppoe_name(), "profile": x.plan_profile},
            server_id=(int(x.server_id) if x.server_id else None),
        )
        jobs.append({"job_id": int(j.id), "type": j.job_type, "connection_id": int(x.id)})

    # Solo sincronizar IP en Mikrotik si se está asignando una IP fija (no si se deja vacío)
    if sync_mikrotik and ip_changed and (x.ip or "").strip():
        j = enqueue_job(
            job_type=JOB_MT_SET_PPP_REMOTE_ADDRESS,
            payload={"name": x.pppoe_name(), "remote_address": (x.ip or "").strip()},
            server_id=(int(x.server_id) if x.server_id else None),
        )
        jobs.append({"job_id": int(j.id), "type": j.job_type, "connection_id": int(x.id)})

    if sync_mikrotik and creds_changed:
        j = enqueue_job(
            job_type=JOB_MT_SET_PPP_CREDENTIALS,
            payload={"old_name": old_name, "name": x.pppoe_name(), "password": x.pppoe_password()},
            server_id=(int(x.server_id) if x.server_id else None),
        )
        jobs.append({"job_id": int(j.id), "type": j.job_type, "connection_id": int(x.id)})

    return jsonify({"connection": _conn_to_dict(x), "jobs": jobs})


@bp.get("/<int:connection_id>/mt_status")
@jwt_required(optional=True)
def connection_mt_status(connection_id: int):
    """
    Estado en vivo desde Mikrotik:
    - ip asignada (active.address)
    - uptime
    - última conexión/desconexión (si el secret lo reporta)
    """
    from ..mikrotik.ros_client import MikrotikRosClient

    x = Connection.query.get_or_404(connection_id)
    if not x.server_id:
        return jsonify({"error": "server_required"}), 400
    s = MikrotikServer.query.get(int(x.server_id))
    if not s:
        return jsonify({"error": "server_not_found"}), 404

    mt = MikrotikRosClient(host=str(s.host), user=str(s.username), password=str(s.password), port=int(s.port or 8728), use_ssl=bool(s.use_ssl))
    now = datetime.utcnow()
    try:
        mt.connect()
        active = mt.get_pppoe_active(name=x.pppoe_name())
        secret = mt.get_pppoe_secret(name=x.pppoe_name())

        ip = None
        uptime = None
        if active:
            ip = active.get("address") or active.get("remote-address") or active.get("ip")  # varía según ROS
            uptime = active.get("uptime")

        last_in = None
        last_out = None
        if secret:
            last_in = secret.get("last-logged-in") or secret.get("last-logged-in-time") or secret.get("last-login")
            last_out = secret.get("last-logged-out") or secret.get("last-logged-out-time") or secret.get("last-logout")

        x.last_seen_at = now
        # Si la IP NO está fija, actualizamos el último valor conocido
        if ip and not bool(getattr(x, "ip_is_fixed", False)):
            x.ip = str(ip)
        if uptime:
            x.last_uptime = str(uptime)
        dt_in = _parse_mt_datetime(str(last_in)) if last_in else None
        dt_out = _parse_mt_datetime(str(last_out)) if last_out else None
        if dt_in:
            x.last_connected_at = dt_in
        if dt_out:
            x.last_disconnected_at = dt_out
        db.session.commit()

        return jsonify(
            {
                "connection_id": x.id,
                "server_id": x.server_id,
                "active": bool(active),
                "assigned_ip": str(ip) if ip else None,
                "uptime": str(uptime) if uptime else None,
                "last_connected_at": _iso(x.last_connected_at),
                "last_disconnected_at": _iso(x.last_disconnected_at),
                "fetched_at": _iso(now),
                "ip": x.ip,
                "ip_is_fixed": bool(getattr(x, "ip_is_fixed", False)),
            }
        )
    except Exception as e:
        return jsonify({"error": "mikrotik_error", "message": str(e), "connection_id": x.id, "server_id": x.server_id}), 502
    finally:
        mt.close()


@bp.post("/<int:connection_id>/cut")
@jwt_required(optional=True)
def cut_connection(connection_id: int):
    """
    Corte por falta de pago:
    - cambia profile del secret a suspended (o el que se pase)
    - marca status CUT
    """
    data = request.get_json(silent=True) or {}
    cut_profile = (data.get("cut_profile") or "suspended").strip()

    x = Connection.query.get_or_404(connection_id)

    x.status = "CUT"
    x.mikrotik_profile = cut_profile
    db.session.commit()

    j = enqueue_job(
        job_type=JOB_MT_SET_PPP_PROFILE,
        payload={"name": x.pppoe_name(), "profile": cut_profile},
        server_id=(int(x.server_id) if x.server_id else None),
    )
    return jsonify({"status": "cut", "connection_id": x.id, "mikrotik_profile": x.mikrotik_profile, "job_id": int(j.id)})


@bp.post("/<int:connection_id>/restore")
@jwt_required(optional=True)
def restore_connection(connection_id: int):
    """
    Restaurar servicio:
    - vuelve a aplicar profile del plan contratado
    - marca status ACTIVE
    """
    x = Connection.query.get_or_404(connection_id)

    x.status = "ACTIVE"
    x.mikrotik_profile = x.plan_profile
    db.session.commit()

    j = enqueue_job(
        job_type=JOB_MT_SET_PPP_PROFILE,
        payload={"name": x.pppoe_name(), "profile": x.plan_profile},
        server_id=(int(x.server_id) if x.server_id else None),
    )
    return jsonify({"status": "restored", "connection_id": x.id, "mikrotik_profile": x.mikrotik_profile, "job_id": int(j.id)})


@bp.delete("/<int:connection_id>")
@jwt_required(optional=True)
def delete_connection(connection_id: int):
    provision_mikrotik = request.args.get("provision_mikrotik", "true").lower() != "false"
    x = Connection.query.get_or_404(connection_id)

    client_id = int(x.client_id)
    server_id = int(x.server_id) if x.server_id else None
    name = x.pppoe_name()

    db.session.delete(x)
    db.session.commit()

    jobs = []
    if provision_mikrotik:
        j = enqueue_job(job_type=JOB_MT_DELETE_PPP_SECRET, payload={"name": name}, server_id=server_id)
        jobs.append({"job_id": int(j.id), "type": j.job_type, "name": name})

    # Si el cliente quedó sin conexiones => RETIRED
    remaining = Connection.query.filter_by(client_id=client_id).count()
    if remaining == 0:
        c = Client.query.get(client_id)
        if c:
            c.status = "RETIRED"
            c.is_active = False
            db.session.commit()
    return jsonify({"status": "deleted", "connection_id": connection_id, "jobs": jobs})

