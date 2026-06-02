from datetime import datetime

from ..extensions import db


class MikrotikServer(db.Model):
    __tablename__ = "mikrotik_servers"

    id = db.Column(db.BigInteger, primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    name = db.Column(db.String(120), nullable=False, unique=True, index=True)

    host = db.Column(db.String(255), nullable=False)
    port = db.Column(db.Integer, nullable=False, default=8728)
    username = db.Column(db.String(128), nullable=False)
    password = db.Column(db.String(255), nullable=False)
    use_ssl = db.Column(db.Boolean, nullable=False, default=False)

    # IP del router que se inyecta como `local-address` en /ppp/profile (gateway PPPoE).
    # Si está vacío no se setea y RouterOS toma su default.
    local_address = db.Column(db.String(64), nullable=True)

