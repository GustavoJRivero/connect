from datetime import date, datetime

from ..extensions import db


class Invoice(db.Model):
    __tablename__ = "invoices"

    id = db.Column(db.BigInteger, primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    client_id = db.Column(db.BigInteger, db.ForeignKey("clients.id"), nullable=False, index=True)
    connection_id = db.Column(db.BigInteger, db.ForeignKey("connections.id"), nullable=True, index=True)

    # Tipo de comprobante (por ahora):
    # - A / B: factura fiscal (estructura lista para AFIP)
    # - X: comprobante NO fiscal
    invoice_type = db.Column(db.String(1), nullable=False)  # "A" / "B" / "X"

    # Emisor (configurable)
    issuer_cuit = db.Column(db.String(32), nullable=False)
    point_of_sale = db.Column(db.Integer, nullable=False)

    # Numeración AFIP
    cbte_number = db.Column(db.Integer, nullable=True, index=True)

    issue_date = db.Column(db.Date, default=date.today, nullable=False)
    due_date = db.Column(db.Date, nullable=True, index=True)

    # Período de facturación
    period_start = db.Column(db.Date, nullable=True)
    period_end = db.Column(db.Date, nullable=True)
    currency = db.Column(db.String(3), default="ARS", nullable=False)

    # Totales (por ahora simple; luego detallamos IVA/percepciones/etc)
    total = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    paid_total = db.Column(db.Numeric(12, 2), nullable=False, default=0)

    status = db.Column(db.String(16), nullable=False, default="DRAFT")  # DRAFT / ISSUED / PAID / VOID

    # Concepto / descripción libre (para facturas manuales)
    description = db.Column(db.String(500), nullable=True)
    notes = db.Column(db.Text, nullable=True)

    # Baja lógica (auditoría)
    is_deleted = db.Column(db.Boolean, default=False, nullable=False, index=True)
    deleted_at = db.Column(db.DateTime, nullable=True)
    deleted_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)

    # AFIP CAE
    cae = db.Column(db.String(32), nullable=True)
    cae_due_date = db.Column(db.Date, nullable=True)

