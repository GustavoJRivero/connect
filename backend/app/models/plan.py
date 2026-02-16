"""
Modelo de planes de servicio de internet.

Cada plan tiene:
- name: nombre visible (ej: "50 Megas")
- profile: nombre del profile en Mikrotik (ej: "50M") — clave única
- download_mbps: velocidad de descarga en Mbps
- upload_mbps: velocidad de carga en Mbps
- price: precio base (sin IVA)
- iva_percent: porcentaje de IVA (ej: 21.00)
- is_active: si el plan está disponible para nuevas contrataciones
"""
from datetime import datetime
from decimal import Decimal

from ..extensions import db


class Plan(db.Model):
    __tablename__ = "plans"

    id = db.Column(db.Integer, primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Nombre visible
    name = db.Column(db.String(100), nullable=False)

    # Profile Mikrotik (clave única, ej: "50M")
    profile = db.Column(db.String(64), nullable=False, unique=True, index=True)

    # Velocidades
    download_mbps = db.Column(db.Integer, nullable=False, default=0)
    upload_mbps = db.Column(db.Integer, nullable=False, default=0)

    # Precio
    price = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    iva_percent = db.Column(db.Numeric(5, 2), nullable=False, default=21)

    # Estado
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    @property
    def price_with_iva(self) -> Decimal:
        """Precio final con IVA incluido."""
        p = Decimal(str(self.price or 0))
        iva = Decimal(str(self.iva_percent or 0))
        return (p * (1 + iva / 100)).quantize(Decimal("0.01"))

    @property
    def iva_amount(self) -> Decimal:
        """Monto de IVA."""
        p = Decimal(str(self.price or 0))
        iva = Decimal(str(self.iva_percent or 0))
        return (p * iva / 100).quantize(Decimal("0.01"))
