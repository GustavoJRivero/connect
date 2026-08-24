import re
from datetime import datetime, timedelta
from decimal import Decimal

from flask import Blueprint, jsonify, make_response, request
from flask_jwt_extended import create_access_token, get_jwt, jwt_required
from sqlalchemy import func, or_

from ..extensions import db
from ..models.client import Client
from ..models.client_portal import ClientNotification, ClientPortalAccount, MpCheckout
from ..models.complaint import Complaint
from ..models.connection import Connection
from ..models.invoice import Invoice
from ..portal.mp import create_preference, mp_configured, mp_public_key
from ..routes.complaints import _complaint_to_dict
from ..routes.invoices import _invoice_to_dict, _payment_status
from ..timezone import iso_utc

bp = Blueprint("portal", __name__, url_prefix="/api/portal")


def _digits(s: str) -> str:
    return re.sub(r"\D", "", s or "")


def _find_client(ident: str) -> Client | None:
    ident = (ident or "").strip()
    if not ident:
        return None
    if "@" in ident:
        return Client.query.filter(func.lower(Client.email) == ident.lower()).first()
    digits = _digits(ident)
    q = Client.query
    if digits:
        return q.filter(or_(Client.dni == digits, Client.cuit == digits, Client.dni == ident, Client.cuit == ident)).first()
    return None


def _portal_client_id() -> int | None:
    claims = get_jwt() or {}
    if claims.get("typ") != "portal":
        return None
    try:
        return int(claims.get("cid"))
    except (TypeError, ValueError):
        return None


def _require_client() -> tuple[Client | None, tuple | None]:
    cid = _portal_client_id()
    if not cid:
        return None, (jsonify({"error": "forbidden", "message": "Sesión de portal inválida."}), 403)
    client = Client.query.get(cid)
    if not client or not client.is_active or getattr(client, "status", "ACTIVE") == "RETIRED":
        return None, (jsonify({"error": "not_found", "message": "Cliente no disponible."}), 404)
    acc = ClientPortalAccount.query.get(cid)
    if not acc or not acc.is_enabled:
        return None, (jsonify({"error": "portal_disabled", "message": "El portal está deshabilitado."}), 403)
    return client, None


def _conn_to_portal(x: Connection) -> dict:
    return {
        "id": x.id,
        "plan_profile": x.plan_profile,
        "status": x.status,
        "service_address": x.service_address,
        "ip": getattr(x, "ip", None),
        "pppoe_name": x.pppoe_name(),
        "billing_day": x.billing_day,
    }


@bp.post("/login")
def login():
    data = request.get_json(force=True) or {}
    ident = (data.get("identifier") or data.get("email") or data.get("username") or "").strip()
    password = data.get("password") or ""
    if not ident or not password:
        return jsonify({"error": "identifier_and_password_required", "message": "Ingresá DNI/CUIT/email y contraseña."}), 400

    client = _find_client(ident)
    if not client:
        return jsonify({"error": "invalid_credentials", "message": "Datos incorrectos."}), 401
    acc = ClientPortalAccount.query.get(client.id)
    if not acc or not acc.is_enabled or not acc.check_password(password):
        return jsonify({"error": "invalid_credentials", "message": "Datos incorrectos."}), 401
    if not client.is_active or getattr(client, "status", "ACTIVE") == "RETIRED":
        return jsonify({"error": "inactive", "message": "Tu cuenta no está activa."}), 403

    acc.last_login_at = datetime.utcnow()
    db.session.commit()
    token = create_access_token(
        identity=f"portal:{client.id}",
        additional_claims={"typ": "portal", "cid": int(client.id)},
        expires_delta=timedelta(hours=12),
    )
    return jsonify({"access_token": token, "client": {"id": client.id, "full_name": client.full_name}})


@bp.get("/me")
@jwt_required()
def me():
    client, err = _require_client()
    if err:
        return err
    unread = ClientNotification.query.filter_by(client_id=client.id).filter(ClientNotification.read_at.is_(None)).count()
    return jsonify({
        "id": client.id,
        "full_name": client.full_name,
        "kind": client.kind,
        "dni": client.dni,
        "cuit": client.cuit,
        "phone": client.phone,
        "email": client.email,
        "address": client.address,
        "unread_notifications": unread,
        "mp_enabled": mp_configured(),
        "mp_public_key": mp_public_key() if mp_configured() else None,
    })


@bp.put("/me/password")
@jwt_required()
def change_password():
    client, err = _require_client()
    if err:
        return err
    data = request.get_json(force=True) or {}
    current = data.get("current_password") or ""
    new = data.get("new_password") or ""
    if len(new) < 6:
        return jsonify({"error": "weak_password", "message": "La contraseña nueva debe tener al menos 6 caracteres."}), 400
    acc = ClientPortalAccount.query.get(client.id)
    if not acc or not acc.check_password(current):
        return jsonify({"error": "invalid_password", "message": "La contraseña actual no es correcta."}), 400
    acc.set_password(new)
    db.session.commit()
    return jsonify({"ok": True})


@bp.get("/summary")
@jwt_required()
def summary():
    client, err = _require_client()
    if err:
        return err
    invoices = (
        Invoice.query.filter_by(client_id=client.id)
        .filter(Invoice.is_deleted.is_(False))
        .filter(Invoice.status == "ISSUED")
        .all()
    )
    debt = Decimal("0")
    unpaid = 0
    overdue = 0
    for inv in invoices:
        st = _payment_status(inv)
        rem = Decimal(str(inv.total or 0)) - Decimal(str(inv.paid_total or 0))
        if rem > 0:
            debt += rem
            unpaid += 1
        if st == "OVERDUE":
            overdue += 1
    connections = Connection.query.filter_by(client_id=client.id).all()
    unread = ClientNotification.query.filter_by(client_id=client.id).filter(ClientNotification.read_at.is_(None)).count()
    recent = (
        Invoice.query.filter_by(client_id=client.id)
        .filter(Invoice.is_deleted.is_(False))
        .filter(Invoice.status.in_(["ISSUED", "PAID"]))
        .order_by(Invoice.id.desc())
        .limit(5)
        .all()
    )
    return jsonify({
        "debt": str(debt),
        "unpaid_count": unpaid,
        "overdue_count": overdue,
        "connections_count": len(connections),
        "unread_notifications": unread,
        "mp_enabled": mp_configured(),
        "recent_invoices": [_invoice_to_dict(x) for x in recent],
        "connections": [_conn_to_portal(x) for x in connections],
    })


@bp.get("/invoices")
@jwt_required()
def invoices():
    client, err = _require_client()
    if err:
        return err
    items = (
        Invoice.query.filter_by(client_id=client.id)
        .filter(Invoice.is_deleted.is_(False))
        .filter(Invoice.status.in_(["ISSUED", "PAID"]))
        .order_by(Invoice.id.desc())
        .limit(200)
        .all()
    )
    return jsonify([_invoice_to_dict(x) for x in items])


@bp.get("/invoices/<int:invoice_id>/pdf")
@jwt_required()
def invoice_pdf(invoice_id: int):
    client, err = _require_client()
    if err:
        return err
    x = Invoice.query.get_or_404(invoice_id)
    if int(x.client_id) != int(client.id) or getattr(x, "is_deleted", False):
        return jsonify({"error": "not_found"}), 404
    from ..billing.pdf import generate_invoice_pdf
    from ..routes.invoices import _pdf_filename

    pdf_bytes = generate_invoice_pdf(x)
    resp = make_response(pdf_bytes)
    resp.headers["Content-Type"] = "application/pdf"
    resp.headers["Content-Disposition"] = f'inline; filename="{_pdf_filename(x)}"'
    return resp


@bp.post("/invoices/<int:invoice_id>/checkout")
@jwt_required()
def invoice_checkout(invoice_id: int):
    client, err = _require_client()
    if err:
        return err
    if not mp_configured():
        return jsonify({"error": "mp_not_configured", "message": "El pago online no está disponible todavía."}), 503
    x = Invoice.query.get_or_404(invoice_id)
    if int(x.client_id) != int(client.id) or getattr(x, "is_deleted", False):
        return jsonify({"error": "not_found"}), 404
    if x.status != "ISSUED":
        return jsonify({"error": "invoice_not_payable", "message": "Esta factura no se puede pagar."}), 409
    remaining = Decimal(str(x.total or 0)) - Decimal(str(x.paid_total or 0))
    if remaining <= 0:
        return jsonify({"error": "already_paid", "message": "Esta factura ya está paga."}), 409

    title = (x.description or f"Factura {x.invoice_type} #{x.id}").strip()
    try:
        pref = create_preference(
            invoice_id=int(x.id),
            title=title,
            amount=remaining,
            email=client.email,
            client_id=int(client.id),
        )
    except Exception as e:
        return jsonify({"error": "mp_preference_failed", "message": str(e)}), 400

    checkout = MpCheckout(
        client_id=int(client.id),
        invoice_id=int(x.id),
        preference_id=str(pref.get("id")),
        init_point=pref.get("init_point") or pref.get("sandbox_init_point"),
        status="PENDING",
        amount=remaining,
    )
    db.session.add(checkout)
    db.session.commit()
    return jsonify({
        "preference_id": checkout.preference_id,
        "init_point": checkout.init_point,
        "public_key": mp_public_key(),
        "amount": str(remaining),
    })


@bp.get("/connections")
@jwt_required()
def connections():
    client, err = _require_client()
    if err:
        return err
    items = Connection.query.filter_by(client_id=client.id).order_by(Connection.id.asc()).all()
    return jsonify([_conn_to_portal(x) for x in items])


@bp.get("/complaints")
@jwt_required()
def list_complaints():
    client, err = _require_client()
    if err:
        return err
    items = Complaint.query.filter_by(client_id=client.id).order_by(Complaint.id.desc()).limit(200).all()
    return jsonify([_complaint_to_dict(x) for x in items])


@bp.post("/complaints")
@jwt_required()
def create_complaint():
    client, err = _require_client()
    if err:
        return err
    data = request.get_json(force=True) or {}
    connection_id = data.get("connection_id")
    if not connection_id:
        return jsonify({"error": "connection_id_required", "message": "Elegí una conexión."}), 400
    conn = Connection.query.get(int(connection_id))
    if not conn or int(conn.client_id) != int(client.id):
        return jsonify({"error": "connection_not_found", "message": "La conexión no es tuya."}), 404
    kind = (data.get("kind") or "TECH").upper().strip()
    if kind not in ("BILLING", "TECH"):
        return jsonify({"error": "invalid_kind"}), 400
    detail = (data.get("detail") or "").strip()
    if len(detail) < 8:
        return jsonify({"error": "detail_required", "message": "Contanos qué pasó (mínimo 8 caracteres)."}), 400
    x = Complaint(
        client_id=int(client.id),
        connection_id=int(conn.id),
        kind=kind,
        detail=detail[:2000],
        status="TODO",
    )
    db.session.add(x)
    from ..portal.notify import notify_client
    notify_client(
        client_id=int(client.id),
        kind="COMPLAINT",
        title="Reclamo registrado",
        body="Recibimos tu reclamo. Te vamos a contactar.",
    )
    db.session.commit()
    return jsonify(_complaint_to_dict(x)), 201


@bp.get("/notifications")
@jwt_required()
def notifications():
    client, err = _require_client()
    if err:
        return err
    items = (
        ClientNotification.query.filter_by(client_id=client.id)
        .order_by(ClientNotification.id.desc())
        .limit(80)
        .all()
    )
    return jsonify([
        {
            "id": n.id,
            "kind": n.kind,
            "title": n.title,
            "body": n.body,
            "invoice_id": n.invoice_id,
            "read_at": iso_utc(n.read_at),
            "created_at": iso_utc(n.created_at),
        }
        for n in items
    ])


@bp.post("/notifications/read-all")
@jwt_required()
def read_all_notifications():
    client, err = _require_client()
    if err:
        return err
    now = datetime.utcnow()
    ClientNotification.query.filter_by(client_id=client.id).filter(ClientNotification.read_at.is_(None)).update({"read_at": now})
    db.session.commit()
    return jsonify({"ok": True})


@bp.post("/notifications/<int:notification_id>/read")
@jwt_required()
def read_notification(notification_id: int):
    client, err = _require_client()
    if err:
        return err
    n = ClientNotification.query.get_or_404(notification_id)
    if int(n.client_id) != int(client.id):
        return jsonify({"error": "not_found"}), 404
    if not n.read_at:
        n.read_at = datetime.utcnow()
        db.session.commit()
    return jsonify({"ok": True})
