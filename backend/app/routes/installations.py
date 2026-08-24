"""
Órdenes de instalación (tickets para el técnico) + webhook de confirmación.

Estados: PENDIENTE / RESERVADO / SIN_COBERTURA / INSTALADA / VENCIDA / CANCELADA.
"""
import json

from flask import Blueprint, current_app, jsonify, request, send_file
from flask_jwt_extended import jwt_required
from sqlalchemy import func

from ..extensions import db
from ..logging_utils import slog
from ..maps.client import MapsClient, MapsError, MapsNotConfigured, parse_availability, parse_install_calc
from ..maps.config import maps_webhook_secret
from ..maps.service import cancel_order, confirm_order, create_order, run_coverage_check
from ..models.client import Client
from ..models.connection import Connection
from ..models.installation_order import (
    ALL_STATUSES,
    InstallationOrder,
    STATUS_INSTALADA,
    STATUS_PENDIENTE,
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

    order = create_order(
        client_id=int(client_id),
        connection_id=(int(connection_id) if connection_id else None),
        location_url=location_url,
        lat=lat,
        lng=lng,
        notes=(data.get("notes") or None),
    )
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
    """Reintenta el chequeo/reserva (PENDIENTE, SIN_COBERTURA o VENCIDA)."""
    o = InstallationOrder.query.get_or_404(order_id)
    if o.status not in (STATUS_PENDIENTE, STATUS_SIN_COBERTURA, STATUS_VENCIDA):
        return jsonify({"error": "invalid_status", "status": o.status}), 409
    run_coverage_check(o)
    db.session.commit()
    return jsonify(_order_to_dict(o, include_raw=True))


@bp.post("/<int:order_id>/confirm")
@jwt_required(optional=True)
def confirm_manual(order_id: int):
    """Confirmación manual de instalación (el operador cierra la orden)."""
    o = InstallationOrder.query.get_or_404(order_id)
    if o.status not in (STATUS_RESERVADO, STATUS_PENDIENTE, STATUS_VENCIDA):
        return jsonify({"error": "invalid_status", "status": o.status}), 409
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
    """Edita datos operativos del ticket (técnico, notas)."""
    o = InstallationOrder.query.get_or_404(order_id)
    data = request.get_json(force=True) or {}
    if "technician" in data:
        o.technician = (str(data.get("technician")).strip() or None) if data.get("technician") is not None else None
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
    if provided != secret:
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
