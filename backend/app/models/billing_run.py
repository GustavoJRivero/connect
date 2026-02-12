from datetime import datetime

from ..extensions import db


class BillingRun(db.Model):
    """
    Registro de cada ejecución del proceso de facturación.
    Sirve como auditoría y para detectar días perdidos (catch-up).
    """
    __tablename__ = "billing_runs"

    id = db.Column(db.BigInteger, primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Fecha de facturación que se procesó (puede diferir de created_at si es catch-up)
    billing_date = db.Column(db.Date, nullable=False, index=True)

    # Tipo de ejecución
    trigger = db.Column(db.String(32), nullable=False, default="SCHEDULER")  # SCHEDULER / MANUAL / CATCHUP

    # Estado
    status = db.Column(db.String(16), nullable=False, default="RUNNING")  # RUNNING / COMPLETED / FAILED

    # Resultados
    connections_processed = db.Column(db.Integer, nullable=False, default=0)
    invoices_created = db.Column(db.Integer, nullable=False, default=0)
    invoices_skipped = db.Column(db.Integer, nullable=False, default=0)
    errors_count = db.Column(db.Integer, nullable=False, default=0)
    errors_detail = db.Column(db.Text, nullable=True)  # JSON con detalle de errores

    # Timestamps
    started_at = db.Column(db.DateTime, nullable=True)
    finished_at = db.Column(db.DateTime, nullable=True)
    duration_ms = db.Column(db.Integer, nullable=True)
