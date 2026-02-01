from datetime import date, datetime

from ..extensions import db


class Payment(db.Model):
    __tablename__ = "payments"

    id = db.Column(db.BigInteger, primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    paid_at = db.Column(db.Date, default=date.today, nullable=True, index=True)

    client_id = db.Column(db.BigInteger, db.ForeignKey("clients.id"), nullable=False, index=True)

    amount = db.Column(db.Numeric(12, 2), nullable=False)
    method = db.Column(db.String(32), nullable=True)  # cash / transfer / mp / etc
    reference = db.Column(db.String(128), nullable=True)  # nro op / comprobante / etc
    note = db.Column(db.String(255), nullable=True)
    created_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)


class PaymentAllocation(db.Model):
    __tablename__ = "payment_allocations"

    id = db.Column(db.BigInteger, primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    payment_id = db.Column(db.BigInteger, db.ForeignKey("payments.id"), nullable=False, index=True)
    invoice_id = db.Column(db.BigInteger, db.ForeignKey("invoices.id"), nullable=False, index=True)

    amount = db.Column(db.Numeric(12, 2), nullable=False)

