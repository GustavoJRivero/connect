from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from sqlalchemy import func

from ..extensions import db
from ..mikrotik.ros_client import MikrotikRosClient
from ..models.connection import Connection
from ..models.job import Job
from ..models.mikrotik_server import MikrotikServer

bp = Blueprint("network", __name__, url_prefix="/api/network")


def _server_to_dict(s: MikrotikServer) -> dict:
    return {
        "id": s.id,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "name": s.name,
        "host": s.host,
        "port": s.port,
        "username": s.username,
        # password no se devuelve por seguridad
        "use_ssl": bool(s.use_ssl),
    }


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
        "last_error": j.last_error,
        "payload_json": j.payload_json,
        "result_json": j.result_json,
    }


@bp.get("/servers")
@jwt_required(optional=True)
def list_servers():
    items = MikrotikServer.query.order_by(MikrotikServer.id.desc()).all()
    pending = (
        db.session.query(Job.server_id, func.count(Job.id).label("cnt"))
        .filter(Job.status == "PENDING")
        .group_by(Job.server_id)
        .all()
    )
    count_map = {int(sid): int(c) for sid, c in pending}
    return jsonify([
        {**_server_to_dict(x), "pending_jobs": count_map.get(x.id, 0)}
        for x in items
    ])


@bp.post("/servers")
@jwt_required(optional=True)
def create_server():
    data = request.get_json(force=True) or {}
    name = (data.get("name") or "").strip()
    host = (data.get("host") or "").strip()
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()
    port = int(data.get("port") or 8728)
    use_ssl = bool(data.get("use_ssl", False))

    if not name:
        return jsonify({"error": "name_required"}), 400
    if not host:
        return jsonify({"error": "host_required"}), 400
    if not username:
        return jsonify({"error": "username_required"}), 400
    if not password:
        return jsonify({"error": "password_required"}), 400

    exists = MikrotikServer.query.filter_by(name=name).first()
    if exists:
        return jsonify({"error": "name_already_exists", "id": int(exists.id)}), 409

    s = MikrotikServer(
        name=name,
        host=host,
        port=port,
        username=username,
        password=password,
        use_ssl=use_ssl,
        created_at=datetime.utcnow(),
    )
    db.session.add(s)
    db.session.commit()
    return jsonify(_server_to_dict(s)), 201


@bp.get("/servers/<int:server_id>")
@jwt_required(optional=True)
def get_server(server_id: int):
    s = MikrotikServer.query.get_or_404(server_id)
    return jsonify(_server_to_dict(s))


@bp.put("/servers/<int:server_id>")
@jwt_required(optional=True)
def update_server(server_id: int):
    s = MikrotikServer.query.get_or_404(server_id)
    data = request.get_json(force=True) or {}

    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"error": "name_required"}), 400
        exists = MikrotikServer.query.filter_by(name=name).filter(MikrotikServer.id != s.id).first()
        if exists:
            return jsonify({"error": "name_already_exists", "id": int(exists.id)}), 409
        s.name = name

    if "host" in data:
        host = (data.get("host") or "").strip()
        if not host:
            return jsonify({"error": "host_required"}), 400
        s.host = host

    if "port" in data:
        s.port = int(data.get("port") or 8728)

    if "username" in data:
        username = (data.get("username") or "").strip()
        if not username:
            return jsonify({"error": "username_required"}), 400
        s.username = username

    if "password" in data:
        password = (data.get("password") or "").strip()
        if not password:
            return jsonify({"error": "password_required"}), 400
        s.password = password

    if "use_ssl" in data:
        s.use_ssl = bool(data.get("use_ssl"))

    db.session.commit()
    return jsonify(_server_to_dict(s))


@bp.delete("/servers/<int:server_id>")
@jwt_required(optional=True)
def delete_server(server_id: int):
    s = MikrotikServer.query.get_or_404(server_id)
    in_use = Connection.query.filter_by(server_id=s.id).count() > 0
    if in_use:
        return jsonify({"error": "server_in_use"}), 409
    db.session.delete(s)
    db.session.commit()
    return jsonify({"status": "deleted"})


@bp.get("/servers/<int:server_id>/jobs")
@jwt_required(optional=True)
def list_server_jobs(server_id: int):
    MikrotikServer.query.get_or_404(server_id)
    items = Job.query.filter_by(server_id=int(server_id)).order_by(Job.id.desc()).limit(200).all()
    return jsonify([_job_to_dict(x) for x in items])


def _test_connection(host: str, port: int, username: str, password: str, use_ssl: bool) -> tuple[bool, str]:
    """Intenta conectar al RouterOS y retorna (ok, error_message)."""
    client = None
    try:
        client = MikrotikRosClient(
            host=host,
            user=username,
            password=password,
            port=port,
            use_ssl=use_ssl,
        )
        client.connect()
        return True, ""
    except Exception as e:
        return False, str(e) or "Error desconocido"
    finally:
        if client:
            try:
                client.close()
            except Exception:
                pass


@bp.post("/servers/<int:server_id>/test")
@jwt_required(optional=True)
def test_server_connection(server_id: int):
    """
    Prueba la conexión al servidor. Opcionalmente recibe body con overrides
    (host, port, username, password, use_ssl) para probar con datos del formulario sin guardar.
    """
    s = MikrotikServer.query.get_or_404(server_id)
    data = request.get_json(silent=True) or {}
    host = (data.get("host") or "").strip() or s.host
    port = int(data.get("port") or s.port)
    username = (data.get("username") or "").strip() or s.username
    password = (data.get("password") or "").strip() if data.get("password") is not None else s.password
    use_ssl = data.get("use_ssl") if "use_ssl" in data else s.use_ssl
    if not host or not username or not password:
        return jsonify({"ok": False, "error": "Faltan host, usuario o contraseña"}), 400
    ok, err = _test_connection(host, port, username, password, bool(use_ssl))
    if ok:
        return jsonify({"ok": True})
    return jsonify({"ok": False, "error": err}), 200


@bp.post("/servers/test")
@jwt_required(optional=True)
def test_connection_inline():
    """
    Prueba conexión con credenciales enviadas en el body (para formulario de alta).
    Body: host, port, username, password, use_ssl.
    """
    data = request.get_json(force=True) or {}
    host = (data.get("host") or "").strip()
    port = int(data.get("port") or 8728)
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()
    use_ssl = bool(data.get("use_ssl", False))
    if not host:
        return jsonify({"ok": False, "error": "Falta host"}), 400
    if not username:
        return jsonify({"ok": False, "error": "Falta usuario"}), 400
    if not password:
        return jsonify({"ok": False, "error": "Falta contraseña"}), 400
    ok, err = _test_connection(host, port, username, password, use_ssl)
    if ok:
        return jsonify({"ok": True})
    return jsonify({"ok": False, "error": err}), 200

