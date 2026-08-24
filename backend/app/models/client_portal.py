from datetime import datetime

from werkzeug.security import check_password_hash, generate_password_hash

from ..extensions import db


class ClientPortalAccount(db.Model):
    __tablename__ = "client_portal_accounts"

    client_id = db.Column(db.BigInteger, db.ForeignKey("clients.id"), primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    is_enabled = db.Column(db.Boolean, default=True, nullable=False)
    last_login_at = db.Column(db.DateTime, nullable=True)

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)


class ClientNotification(db.Model):
    __tablename__ = "client_notifications"

    id = db.Column(db.BigInteger, primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    client_id = db.Column(db.BigInteger, db.ForeignKey("clients.id"), nullable=False, index=True)
    kind = db.Column(db.String(24), nullable=False, default="SYSTEM")  # INVOICE / PAYMENT / COMPLAINT / SYSTEM
    title = db.Column(db.String(160), nullable=False)
    body = db.Column(db.String(500), nullable=True)
    invoice_id = db.Column(db.BigInteger, db.ForeignKey("invoices.id"), nullable=True, index=True)
    read_at = db.Column(db.DateTime, nullable=True, index=True)


class MpCheckout(db.Model):
    __tablename__ = "mp_checkouts"

    id = db.Column(db.BigInteger, primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    client_id = db.Column(db.BigInteger, db.ForeignKey("clients.id"), nullable=False, index=True)
    invoice_id = db.Column(db.BigInteger, db.ForeignKey("invoices.id"), nullable=False, index=True)
    preference_id = db.Column(db.String(80), unique=True, nullable=False, index=True)
    init_point = db.Column(db.String(500), nullable=True)
    status = db.Column(db.String(24), nullable=False, default="PENDING")  # PENDING / APPROVED / REJECTED
    amount = db.Column(db.Numeric(12, 2), nullable=False)
    mp_payment_id = db.Column(db.String(64), nullable=True, index=True)
