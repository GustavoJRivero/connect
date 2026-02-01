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

