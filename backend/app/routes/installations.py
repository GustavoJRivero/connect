"""
Órdenes de instalación (tickets para el técnico) + webhook de confirmación.

Estados: RESERVADO / SIN_COBERTURA / INSTALADA / VENCIDA / CANCELADA.
"""
import hmac
import json

from flask import Blueprint, current_app, jsonify, request, send_file
from flask_jwt_extended import jwt_required
from sqlalchemy import func

from ..extensions import db
from ..logging_utils import slog
from ..maps.client import MapsClient, MapsError, MapsNotConfigured, parse_availability, parse_install_calc
from ..maps.config import maps_webhook_secret
from ..maps.service import (
    CoverageCheckFailed,
    cancel_order,
    confirm_order,
    create_order,
    parse_latlng_text,
    run_coverage_check,
)
from ..models.client import Client
from ..models.connection import Connection
from ..models.role import Role
from ..models.user import User
from ..models.installation_order import (
    ALL_STATUSES,
    InstallationOrder,
    STATUS_INSTALADA,
    STATUS_RESERVADO,
    STATUS_SIN_COBERTURA,
    STATUS_VENCIDA,
)
from ..timezone import iso_utc

bp = Blueprint("installations", __name__, url_prefix="/api/installations")
webhook_bp = Blueprint("maps_webhooks", __name__, url_prefix="/api/webhooks/maps")


def _order_to_dict(o: InstallationOrder, include_raw: bool = False) -> dict:
    client = o.client
    conn = o.connection
    out = {
        "id": o.id,
        "created_at": iso_utc(o.created_at),
        "client_id": o.client_id,
        "client_name": (client.full_name if client else None),
        "client_phone": (client.phone if client else None),
        "connection_id": o.connection_id,
        "plan_profile": (conn.plan_profile if conn else None),
        "service_address": (conn.service_address if conn else None),
        "location_url": o.location_url,
        "latitude": (str(o.latitude) if o.latitude is not None else None),
        "longitude": (str(o.longitude) if o.longitude is not None else None),
        "status": o.status,
        "nap_ref": o.nap_ref,
        "nap_name": o.nap_name,
        "fiber_meters": (str(o.fiber_meters) if o.fiber_meters is not None else None),
        "reserved_at": iso_utc(o.reserved_at),
        "expires_at": iso_utc(o.expires_at),
        "confirmed_at": iso_utc(o.confirmed_at),
        "expired_at": iso_utc(o.expired_at),
        "last_maps_error": o.last_maps_error,
        "technician": o.technician,
        "technician_user_id": o.technician_user_id,
        "notes": o.notes,
    }
    if include_raw:
        for field, key in (("availability_json", "availability"), ("install_calc_json", "install_calc")):
            raw = getattr(o, field)
            try:
                out[key] = json.loads(raw) if raw else None
            except ValueError:
                out[key] = None
    return out


@bp.get("")
@jwt_required(optional=True)
def list_orders():
    status = (request.args.get("status") or "").strip().upper()
    client_id = request.args.get("client_id")
    try:
        limit = max(1, min(int(request.args.get("limit") or 50), 200))
    except ValueError:
        limit = 50
    try:
        offset = max(0, int(request.args.get("offset") or 0))
    except ValueError:
        offset = 0

    q = InstallationOrder.query
    if status and status in ALL_STATUSES:
        q = q.filter(InstallationOrder.status == status)
    if client_id:
        q = q.filter(InstallationOrder.client_id == int(client_id))

    total = q.count()
    items = q.order_by(InstallationOrder.id.desc()).offset(offset).limit(limit).all()
    return jsonify({
        "items": [_order_to_dict(o) for o in items],
        "total": total,
        "limit": limit,
        "offset": offset,
    })


@bp.get("/summary")
@jwt_required(optional=True)
def orders_summary():
    rows = (
        db.session.query(InstallationOrder.status, func.count(InstallationOrder.id))
        .group_by(InstallationOrder.status)
        .all()
    )
    counts = {s: 0 for s in ALL_STATUSES}
    counts.update({str(s): int(n) for s, n in rows})
    return jsonify(counts)


@bp.get("/<int:order_id>")
@jwt_required(optional=True)
def get_order(order_id: int):
    o = InstallationOrder.query.get_or_404(order_id)
    return jsonify(_order_to_dict(o, include_raw=True))


@bp.post("")
@jwt_required(optional=True)
def create_order_endpoint():
    """
    Crea una orden de instalación para un cliente (y opcionalmente conexión)
    existentes, y corre el chequeo de cobertura + reserva.

    Body: { client_id, connection_id?, location_url? , lat?, lng?, notes? }
    """
    data = request.get_json(force=True) or {}
    client_id = data.get("client_id")
    if not client_id:
        return jsonify({"error": "client_id_required"}), 400
    Client.query.get_or_404(int(client_id))

    connection_id = data.get("connection_id")
    if connection_id:
        conn = Connection.query.get_or_404(int(connection_id))
        if int(conn.client_id) != int(client_id):
            return jsonify({"error": "connection_client_mismatch"}), 400

    location_url = (data.get("location_url") or "").strip() or None
    lat = data.get("lat")
    lng = data.get("lng")
    if not location_url and (lat is None or lng is None):
        return jsonify({"error": "location_required"}), 400

    try:
        order = create_order(
            client_id=int(client_id),
            connection_id=(int(connection_id) if connection_id else None),
            location_url=location_url,
            lat=lat,
            lng=lng,
            notes=(data.get("notes") or None),
        )
    except CoverageCheckFailed as e:
        db.session.rollback()
        return e.to_response()
    db.session.commit()
    return jsonify(_order_to_dict(order, include_raw=True)), 201


@bp.post("/preview")
@jwt_required(optional=True)
def preview_coverage():
    """
    Chequeo de cobertura SIN persistir nada (para previsualizar en el alta).

    Body: { location_url? , lat?, lng? }
    """
    data = request.get_json(force=True) or {}
    location_url = (data.get("location_url") or "").strip() or None
    lat = data.get("lat")
    lng = data.get("lng")
    if not location_url and (lat is None or lng is None):
        return jsonify({"error": "location_required"}), 400

    try:
        mc = MapsClient()
    except MapsNotConfigured:
        return jsonify({"error": "maps_not_configured"}), 503

    loc = {"url": location_url} if location_url else {"lat": lat, "lng": lng}
    try:
        avail_raw = mc.check_availability(**loc)
        avail = parse_availability(avail_raw)
    except MapsError as e:
        return jsonify({"error": "maps_error", "code": e.code, "message": e.message}), 502

    calc = None
    if avail["available"]:
        try:
            calc = parse_install_calc(mc.calculate_install(**loc))
        except MapsError:
            calc = None

    # Coordenadas resueltas de la ubicación consultada (las devuelve /a).
    loc_out = avail_raw.get("location") if isinstance(avail_raw.get("location"), dict) else None

    # Coordenadas del NAP elegido (geometría del feature) para dibujar el mapa.
    chosen = dict(avail["naps"][0]) if avail["naps"] else None
    if chosen and chosen.get("ref"):
        try:
            feat = mc.get_feature(chosen["ref"], view="full")
            coords = (((feat.get("feature") or {}).get("geometry") or {}).get("coordinates") or [])
            if isinstance(coords, list) and len(coords) == 2:
                chosen["lng"] = float(coords[0])
                chosen["lat"] = float(coords[1])
        except (MapsError, TypeError, ValueError):
            pass

    return jsonify({
        "available": avail["available"],
        "naps": avail["naps"],
        "chosen_nap": chosen,
        "fiber_meters": (calc or {}).get("fiber_meters"),
        "location": loc_out,
        "radius_meters": avail_raw.get("radiusMeters"),
    })


@bp.post("/<int:order_id>/retry-check")
@jwt_required(optional=True)
def retry_check(order_id: int):
    """Reintenta el chequeo/reserva (SIN_COBERTURA o VENCIDA)."""
    o = InstallationOrder.query.get_or_404(order_id)
    if o.status not in (STATUS_SIN_COBERTURA, STATUS_VENCIDA):
        return jsonify({"error": "invalid_status", "status": o.status}), 409
    try:
        run_coverage_check(o)
    except CoverageCheckFailed as e:
        db.session.rollback()
        return e.to_response()
    db.session.commit()
    return jsonify(_order_to_dict(o, include_raw=True))


@bp.post("/<int:order_id>/relocate")
@jwt_required(optional=True)
def relocate(order_id: int):
    """Cambia la ubicación de la orden y vuelve a chequear cobertura/reserva.

    Body: { location_url, service_address? }
    Si la orden tenía puerto reservado, se libera recién después de que el chequeo
    nuevo termine bien: si el mapa falla, la orden queda como estaba.
    """
    o = InstallationOrder.query.get_or_404(order_id)
    if o.status not in (STATUS_SIN_COBERTURA, STATUS_VENCIDA, STATUS_RESERVADO):
        return jsonify({"error": "invalid_status", "status": o.status}), 409
    data = request.get_json(force=True) or {}
    location_url = (data.get("location_url") or "").strip()
    if not location_url:
        return jsonify({"error": "location_required", "message": "Ingresá la nueva ubicación."}), 400

    previous_nap = o.nap_ref if o.status == STATUS_RESERVADO else None
    lat, lng = parse_latlng_text(location_url)
    o.location_url = location_url[:1000]
    o.latitude = lat
    o.longitude = lng
    o.nap_ref = None
    o.nap_name = None
    o.fiber_meters = None
    o.install_calc_json = None
    o.reserved_at = None
    o.expires_at = None
    o.expired_at = None
    if "service_address" in data and o.connection is not None:
        o.connection.service_address = (str(data.get("service_address") or "").strip()[:255] or None)

    try:
        run_coverage_check(o)
    except CoverageCheckFailed as e:
        db.session.rollback()
        return e.to_response()

    if previous_nap:
        try:
            MapsClient().release_port(previous_nap)
        except (MapsError, MapsNotConfigured) as e:
            detail = f"{e.code} {e.message}" if isinstance(e, MapsError) else str(e)
            o.last_maps_error = f"release (cambio de ubicación): {detail}"[:500]
    slog(
        module="INSTALL",
        action="RELOCATED",
        message=f"Orden #{o.id}: ubicación cambiada, quedó {o.status}",
        details={"order_id": o.id, "location": o.location_url, "released_nap": previous_nap, "nap": o.nap_ref},
        ref_id=o.id,
        ref_type="installation_order",
    )
    db.session.commit()
    return jsonify(_order_to_dict(o, include_raw=True))


def _technician_users():
    return (
        User.query.join(Role, User.role_id == Role.id)
        .filter(Role.is_technician.is_(True), User.is_active.is_(True))
        .order_by(User.first_name.asc(), User.last_name.asc(), User.username.asc())
        .all()
    )


def _technician_label(u: User) -> str:
    return (u.full_name or u.username)[:120]


def _assign_technician(o: InstallationOrder, raw_id):
    """Asigna el técnico por id de usuario; devuelve una respuesta de error o None."""
    if raw_id in (None, ""):
        o.technician_user_id = None
        o.technician = None
        return None
    try:
        user = User.query.get(int(raw_id))
    except (TypeError, ValueError):
        user = None
    if user is None or not user.is_active or not user.is_technician:
        return jsonify({
            "error": "invalid_technician",
            "message": "Elegí un técnico activo (un usuario con rol de técnico).",
        }), 400
    o.technician_user_id = user.id
    o.technician = _technician_label(user)
    return None


@bp.get("/technicians")
@jwt_required(optional=True)
def list_technicians():
    return jsonify([{"id": u.id, "name": _technician_label(u)} for u in _technician_users()])


@bp.post("/<int:order_id>/confirm")
@jwt_required(optional=True)
def confirm_manual(order_id: int):
    """Confirmación manual de instalación: el operador elige qué técnico la hizo.

    Body: { technician_user_id }
    """
    o = InstallationOrder.query.get_or_404(order_id)
    if o.status not in (STATUS_RESERVADO, STATUS_VENCIDA):
        return jsonify({"error": "invalid_status", "status": o.status}), 409
    data = request.get_json(force=True) or {}
    if not data.get("technician_user_id"):
        return jsonify({"error": "technician_required", "message": "Elegí el técnico que hizo la instalación."}), 400
    err = _assign_technician(o, data.get("technician_user_id"))
    if err:
        return err
    confirm_order(o, source="manual")
    db.session.commit()
    return jsonify(_order_to_dict(o))


@bp.post("/<int:order_id>/cancel")
@jwt_required(optional=True)
def cancel(order_id: int):
    o = InstallationOrder.query.get_or_404(order_id)
    if o.status in (STATUS_INSTALADA,):
        return jsonify({"error": "invalid_status", "status": o.status}), 409
    cancel_order(o)
    db.session.commit()
    return jsonify(_order_to_dict(o))


@bp.put("/<int:order_id>")
@jwt_required(optional=True)
def update_order(order_id: int):
    """Edita datos operativos del ticket (técnico asignado, notas)."""
    o = InstallationOrder.query.get_or_404(order_id)
    data = request.get_json(force=True) or {}
    if "technician_user_id" in data:
        err = _assign_technician(o, data.get("technician_user_id"))
        if err:
            return err
    if "notes" in data:
        o.notes = (str(data.get("notes")).strip() or None) if data.get("notes") is not None else None
    db.session.commit()
    return jsonify(_order_to_dict(o))


@bp.get("/<int:order_id>/pdf")
@jwt_required(optional=True)
def order_pdf(order_id: int):
    import io

    from ..maps.pdf import generate_work_order_pdf

    o = InstallationOrder.query.get_or_404(order_id)
    pdf_bytes = generate_work_order_pdf(o)
    return send_file(
        io.BytesIO(pdf_bytes),
        mimetype="application/pdf",
        as_attachment=False,
        download_name=f"orden_instalacion_{o.id}.pdf",
    )


# ----------------------------------------------------------------------
# Webhook: la app de mapas confirma la instalación
# ----------------------------------------------------------------------
@webhook_bp.post("/install-confirmed")
def webhook_install_confirmed():
    """
    Contrato tentativo (coordinar con el equipo del mapa):

      POST /api/webhooks/maps/install-confirmed
      Header: X-Webhook-Secret: <MAPS_WEBHOOK_SECRET>
      Body:   { "order_id": 123 }            (preferido)
              o { "nap": "NAP-2" }           (fallback: última orden RESERVADO de ese NAP)

    Respuesta: { status: "ok", order: {...} }
    """
    secret = maps_webhook_secret()
    if not secret:
        return jsonify({"error": "webhook_not_configured"}), 503
    provided = (request.headers.get("X-Webhook-Secret") or "").strip()
    if not provided or not hmac.compare_digest(provided, secret):
        return jsonify({"error": "invalid_secret"}), 401

    data = request.get_json(silent=True) or {}
    order = None

    if data.get("order_id"):
        order = InstallationOrder.query.get(int(data["order_id"]))
    elif data.get("nap"):
        nap = str(data["nap"]).strip()
        order = (
            InstallationOrder.query
            .filter(InstallationOrder.status == STATUS_RESERVADO)
            .filter((InstallationOrder.nap_ref == nap) | (InstallationOrder.nap_name == nap))
            .order_by(InstallationOrder.id.desc())
            .first()
        )

    if not order:
        return jsonify({"error": "order_not_found"}), 404
    if order.status == STATUS_INSTALADA:
        return jsonify({"status": "ok", "order": _order_to_dict(order), "already_confirmed": True})

    confirm_order(order, source="webhook")
    db.session.commit()
    slog(
        module="INSTALL",
        action="WEBHOOK_RECEIVED",
        message=f"Webhook de instalación confirmada para orden #{order.id}",
        details={"order_id": order.id, "payload": data},
        ref_id=order.id,
        ref_type="installation_order",
    )
    return jsonify({"status": "ok", "order": _order_to_dict(order)})
