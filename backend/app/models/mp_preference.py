import json
from datetime import datetime

from ..extensions import db


class MpPreference(db.Model):
    """
    Trackea un link de pago generado con Mercado Pago.

    Ciclo de vida:
      PENDING  → el cliente aún no pagó (o no confirmamos el pago)
      PAID     → webhook de MP confirmó el pago; se creó el Payment correspondiente
      EXPIRED  → vencido sin pago (se puede marcar manualmente o por job de limpieza)
    """
    __tablename__ = "mp_preferences"

    id = db.Column(db.BigInteger, primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Datos del link
    preference_id = db.Column(db.String(128), nullable=True, unique=True, index=True)
    client_id = db.Column(db.BigInteger, db.ForeignKey("clients.id"), nullable=False, index=True)

    # Facturas incluidas en este link (JSON array de IDs)
    invoice_ids_json = db.Column(db.Text, nullable=False, default="[]")

    # Monto total del link
    total = db.Column(db.Numeric(12, 2), nullable=False)

    # Estado
    status = db.Column(db.String(16), nullable=False, default="PENDING", index=True)

    # Cuando se confirma el pago
    paid_at = db.Column(db.DateTime, nullable=True)
    payment_id = db.Column(db.BigInteger, db.ForeignKey("payments.id"), nullable=True, index=True)

    # ID del pago en MP (número)
    mp_payment_id = db.Column(db.String(64), nullable=True, index=True)

    @property
    def invoice_ids(self):
        try:
            return json.loads(self.invoice_ids_json or "[]")
        except Exception:
            return []

    @invoice_ids.setter
    def invoice_ids(self, value):
        self.invoice_ids_json = json.dumps(value or [])
