"""
Modelo de planes de servicio de internet.

Cada plan tiene:
- name: nombre visible (ej: "50 Megas")
- profile: nombre del profile en Mikrotik (ej: "50M") — clave única
- download_mbps: velocidad de descarga en Mbps
- upload_mbps: velocidad de carga en Mbps
- rate_limit: string libre que se envía tal cual al `/ppp/profile` de RouterOS.
              Si está vacío se arma simple "{upload_mbps}M/{download_mbps}M".
              Formato completo Mikrotik:
                "<rxRate>/<txRate> <rxBurst>/<txBurst> <rxThr>/<txThr> <rxBurstTime>/<txBurstTime> <prio> <rxMin>/<txMin>"
              Ej: "500M/500M 550M/550M 255M/255M 40/40 0 20M/20M"
- price: precio final que paga el cliente (IVA incluido)
- iva_percent: alícuota (ej: 21.00) — el neto y el IVA se deducen de `price`
- is_active: si el plan está disponible para nuevas contrataciones
"""
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP

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

    # rate-limit completo de RouterOS (opcional). Si está vacío se arma simple
    # "{upload_mbps}M/{download_mbps}M" al pushearlo al router.
    rate_limit = db.Column(db.String(255), nullable=True)

    # Precio final (IVA incluido): lo que ingresa el usuario y lo que se factura.
    price = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    iva_percent = db.Column(db.Numeric(5, 2), nullable=False, default=21)

    # Estado
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    @property
    def price_gross(self) -> Decimal:
        """Precio final (igual al valor persistido en `price`)."""
        return Decimal(str(self.price or 0)).quantize(Decimal("0.01"))

    @property
    def price_net(self) -> Decimal:
        """Neto gravado: precio final / (1 + IVA%)."""
        gross = Decimal(str(self.price or 0))
        iva = Decimal(str(self.iva_percent or 0))
        if iva <= 0:
            return gross.quantize(Decimal("0.01"))
        divisor = Decimal("1") + (iva / Decimal("100"))
        return (gross / divisor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    @property
    def price_with_iva(self) -> Decimal:
        """Total a cobrar (precio final). Mantiene nombre por compatibilidad con facturación."""
        return self.price_gross

    @property
    def iva_amount(self) -> Decimal:
        """IVA incluido en el precio final (gross − neto)."""
        gross = Decimal(str(self.price or 0)).quantize(Decimal("0.01"))
        net = self.price_net
        return (gross - net).quantize(Decimal("0.01"))

    def computed_rate_limit(self) -> str:
        """rate-limit que se envía a RouterOS.
        Si `rate_limit` está cargado se usa tal cual.
        Si no, se arma simple "{upload}M/{download}M" con los Mbps del plan.
        """
        if self.rate_limit and str(self.rate_limit).strip():
            return str(self.rate_limit).strip()
        up = int(self.upload_mbps or 0)
        down = int(self.download_mbps or 0)
        return f"{up}M/{down}M"
