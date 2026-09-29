from datetime import datetime

from ..extensions import db


class ClientCreditMovement(db.Model):
    # Ledger de Client.credit_balance: amount positivo = crédito generado,
    # negativo = crédito aplicado a una factura.
    __tablename__ = "client_credit_movements"

    id = db.Column(db.BigInteger, primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    client_id = db.Column(db.BigInteger, db.ForeignKey("clients.id"), nullable=False, index=True)
    amount = db.Column(db.Numeric(12, 2), nullable=False)
    reason = db.Column(db.String(32), nullable=False)  # PAYMENT_EXCESS / APPLIED_TO_INVOICE

    payment_id = db.Column(db.BigInteger, db.ForeignKey("payments.id"), nullable=True, index=True)
    invoice_id = db.Column(db.BigInteger, db.ForeignKey("invoices.id"), nullable=True, index=True)
