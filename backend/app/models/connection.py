from datetime import datetime

from ..extensions import db


class Connection(db.Model):
    __tablename__ = "connections"

    id = db.Column(db.BigInteger, primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    client_id = db.Column(db.BigInteger, db.ForeignKey("clients.id"), nullable=False, index=True)

    # PPPoE server / Mikrotik donde está el usuario
    server_id = db.Column(db.BigInteger, db.ForeignKey("mikrotik_servers.id"), nullable=True, index=True)

    # Domicilio del servicio (puede diferir del domicilio del titular)
    service_address = db.Column(db.String(255), nullable=True)

    # Ubicación (texto libre: barrio, referencia, GPS, etc.)
    location = db.Column(db.String(255), nullable=True)

    # Plan contratado: se mapea 1:1 con el profile de Mikrotik
    plan_profile = db.Column(db.String(64), nullable=False)  # ej: 25M / 50M / 100M / 300M

    # Facturación: día del mes (1-28) para cerrar período; prorratear primer mes
    billing_day = db.Column(db.Integer, nullable=False, default=1)
    prorate_first_month = db.Column(db.Boolean, nullable=False, default=True)

    # Estado lógico
    status = db.Column(db.String(32), nullable=False, default="ACTIVE")  # ACTIVE / CUT / DISABLED

    # Mikrotik
    mikrotik_profile = db.Column(db.String(64), nullable=False)  # current profile aplicado en MT

    # Último estado conocido (snapshot)
    ip = db.Column(db.String(64), nullable=True)
    ip_is_fixed = db.Column(db.Boolean, nullable=False, default=False)
    last_uptime = db.Column(db.String(64), nullable=True)
    last_connected_at = db.Column(db.DateTime, nullable=True)
    last_disconnected_at = db.Column(db.DateTime, nullable=True)
    last_seen_at = db.Column(db.DateTime, nullable=True)

    # PPPoE credentials (por defecto = id, pero editable)
    pppoe_username = db.Column(db.String(128), nullable=True, index=True)
    pppoe_password_value = db.Column("pppoe_password", db.String(128), nullable=True)

    def pppoe_name(self) -> str:
        return str(self.pppoe_username or self.id)

    def pppoe_password(self) -> str:
        return str(self.pppoe_password_value or self.id)

