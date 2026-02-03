from datetime import date, timedelta

from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy import func

from ..extensions import db
from ..models.client import Client
from ..models.complaint import Complaint
from ..models.connection import Connection
from ..models.invoice import Invoice
from ..models.job import Job
from ..models.payment import Payment
from ..models.user import User

bp = Blueprint("dashboard", __name__, url_prefix="/api/dashboard")


@bp.get("/summary")
@jwt_required()
def summary():
    today = date.today()

    # Month range (inclusive)
    month_start = date(today.year, today.month, 1)
    if today.month == 12:
        next_month_start = date(today.year + 1, 1, 1)
    else:
        next_month_start = date(today.year, today.month + 1, 1)
    month_end = next_month_start - timedelta(days=1)

    # Connections
    connections_total = db.session.query(func.count(Connection.id)).scalar() or 0
    connections_active = (
        db.session.query(func.count(Connection.id)).filter(Connection.status == "ACTIVE").scalar() or 0
    )
    connections_cut = db.session.query(func.count(Connection.id)).filter(Connection.status == "CUT").scalar() or 0

    # Clients
    clients_total = db.session.query(func.count(Client.id)).scalar() or 0
    clients_active = db.session.query(func.count(Client.id)).filter(Client.status == "ACTIVE").scalar() or 0
    clients_retired = db.session.query(func.count(Client.id)).filter(Client.status == "RETIRED").scalar() or 0

    # Invoices
    balance_expr = Invoice.total - Invoice.paid_total
    invoices_open_filter = (
        (Invoice.is_deleted.is_(False))
        & (Invoice.status.in_(["ISSUED", "DRAFT"]))
        & (balance_expr > 0)
    )
    invoices_overdue = (
        db.session.query(func.count(Invoice.id))
        .filter(invoices_open_filter)
        .filter(Invoice.due_date.isnot(None))
        .filter(Invoice.due_date < today)
        .scalar()
        or 0
    )
    debt_total = (
        db.session.query(func.coalesce(func.sum(balance_expr), 0))
        .filter(invoices_open_filter)
        .scalar()
        or 0
    )

    # Payments
    payments_today_total = (
        db.session.query(func.coalesce(func.sum(Payment.amount), 0)).filter(Payment.paid_at == today).scalar() or 0
    )
    payments_today_count = db.session.query(func.count(Payment.id)).filter(Payment.paid_at == today).scalar() or 0
    payments_month_total = (
        db.session.query(func.coalesce(func.sum(Payment.amount), 0))
        .filter(Payment.paid_at >= month_start)
        .filter(Payment.paid_at <= month_end)
        .scalar()
        or 0
    )

    # Jobs (Mikrotik provisioning, etc.)
    jobs_pending = db.session.query(func.count(Job.id)).filter(Job.status == "PENDING").scalar() or 0
    jobs_running = db.session.query(func.count(Job.id)).filter(Job.status == "RUNNING").scalar() or 0
    jobs_failed = db.session.query(func.count(Job.id)).filter(Job.status == "FAILED").scalar() or 0

    # Complaints
    complaints_open = (
        db.session.query(func.count(Complaint.id)).filter(Complaint.status.in_(["TODO", "WIP"])).scalar() or 0
    )

    # Recent payments (transactions)
    # Ojo: puede haber pagos con client_id inválido (hoy no se valida en create_payment).
    # Usamos OUTER JOIN para que igualmente aparezcan como transacciones recientes.
    recent_rows = (
        db.session.query(Payment, Client, User)
        .outerjoin(Client, Client.id == Payment.client_id)
        .outerjoin(User, User.id == Payment.created_by_user_id)
        .order_by(Payment.created_at.desc(), Payment.id.desc())
        .limit(10)
        .all()
    )
    recent_payments = []
    for p, c, u in recent_rows:
        recent_payments.append(
            {
                "id": int(p.id),
                "client_id": int(p.client_id),
                "client_name": (c.full_name if c else None),
                "amount": str(p.amount),
                "method": p.method,
                "created_at": p.created_at.isoformat() if getattr(p, "created_at", None) else None,
                "paid_at": p.paid_at.isoformat() if getattr(p, "paid_at", None) else None,
                "created_by": (
                    {"id": int(u.id), "username": u.username} if u else {"id": None, "username": None}
                ),
            }
        )

    return jsonify(
        {
            "today": today.isoformat(),
            "month_start": month_start.isoformat(),
            "month_end": month_end.isoformat(),
            "clients": {
                "total": int(clients_total),
                "active": int(clients_active),
                "retired": int(clients_retired),
            },
            "connections": {
                "total": int(connections_total),
                "active": int(connections_active),
                "cut": int(connections_cut),
            },
            "invoices": {
                "overdue": int(invoices_overdue),
                "debt_total": str(debt_total),
            },
            "payments": {
                "today_total": str(payments_today_total),
                "today_count": int(payments_today_count),
                "month_total": str(payments_month_total),
            },
            "jobs": {
                "pending": int(jobs_pending),
                "running": int(jobs_running),
                "failed": int(jobs_failed),
            },
            "complaints": {"open": int(complaints_open)},
            "recent_payments": recent_payments,
        }
    )

