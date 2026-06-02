"""
Modelo de planes de servicio de internet.

Cada plan tiene:
- name: nombre visible (ej: "50 Megas")
- profile: nombre del profile en Mikrotik (ej: "50M") — clave única
- download_mbps: velocidad de descarga en Mbps
- upload_mbps: velocidad de carga en Mbps
- rate_limit: string libre que se envía tal cual al `/ppp/profile` de RouterOS.
              Si está vacío se arma con la fórmula automática (ver computed_rate_limit).
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


# ----------------------------------------------------------------------
# Fórmula automática de rate-limit (para planes sin rate_limit manual)
# Componentes en función de download/upload Mbps. round() corta decimales.
# ----------------------------------------------------------------------
RATE_BURST_FACTOR = 1.1     # burst-limit  = base * 1.1
RATE_THRESHOLD_FACTOR = 0.51  # burst-threshold = base * 0.51
RATE_LIMIT_AT_FACTOR = 0.04   # limit-at       = base * 0.04
RATE_BURST_TIME = "40/40"
RATE_PRIORITY = "0"


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
        """rate-limit que se envía a RouterOS para este plan.

        - Si `self.rate_limit` está cargado se usa tal cual (manual override).
        - Si no, se arma el string completo con la fórmula:
              "{down}M/{up}M
               {down*1.1}M/{up*1.1}M
               {down*0.51}M/{up*0.51}M
               40/40
               0
               {down*0.04}M/{up*0.04}M"
          Ej. plan 500/500 → "500M/500M 550M/550M 255M/255M 40/40 0 20M/20M"
              plan 700/700 → "700M/700M 770M/770M 357M/357M 40/40 0 28M/28M"
        - Si download y upload son 0 (plan recién creado o sin definir) se devuelve
          "0M/0M" para no ensuciar el router con el resto en cero.
        """
        if self.rate_limit and str(self.rate_limit).strip():
            return str(self.rate_limit).strip()

        down = int(self.download_mbps or 0)
        up = int(self.upload_mbps or 0)
        if down <= 0 and up <= 0:
            return "0M/0M"

        def _scale(value: int, factor: float) -> int:
            return int(round(value * factor))

        max_limit = f"{down}M/{up}M"
        burst_limit = f"{_scale(down, RATE_BURST_FACTOR)}M/{_scale(up, RATE_BURST_FACTOR)}M"
        threshold = f"{_scale(down, RATE_THRESHOLD_FACTOR)}M/{_scale(up, RATE_THRESHOLD_FACTOR)}M"
        limit_at = f"{_scale(down, RATE_LIMIT_AT_FACTOR)}M/{_scale(up, RATE_LIMIT_AT_FACTOR)}M"
        return f"{max_limit} {burst_limit} {threshold} {RATE_BURST_TIME} {RATE_PRIORITY} {limit_at}"
