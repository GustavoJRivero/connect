from datetime import datetime

from ..extensions import db


class Client(db.Model):
    __tablename__ = "clients"

    id = db.Column(db.BigInteger, primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Persona vs Empresa
    kind = db.Column(db.String(16), nullable=False, default="PERSON")  # PERSON / COMPANY

    # Datos básicos (titular)
    full_name = db.Column(db.String(200), nullable=False)  # o razón social
    dni = db.Column(db.String(32), nullable=True, unique=True, index=True)  # persona
    cuit = db.Column(db.String(32), nullable=True, unique=True, index=True)  # empresa (o persona responsable)
    phone = db.Column(db.String(50), nullable=True)
    email = db.Column(db.String(200), nullable=True)
    address = db.Column(db.String(255), nullable=True)

    # Estado del cliente
    status = db.Column(db.String(32), nullable=False, default="ACTIVE", index=True)  # ACTIVE / RETIRED
    is_active = db.Column(db.Boolean, default=True, nullable=False)

    connections = db.relationship(
        "Connection",
        backref="client",
        lazy=True,
        cascade="all, delete-orphan",
        order_by="Connection.id",
    )

