from datetime import datetime

from ..extensions import db


class Complaint(db.Model):
    __tablename__ = "complaints"

    id = db.Column(db.BigInteger, primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)

    client_id = db.Column(db.BigInteger, db.ForeignKey("clients.id"), nullable=False, index=True)
    connection_id = db.Column(db.BigInteger, db.ForeignKey("connections.id"), nullable=False, index=True)

    # Tipo de reclamo
    kind = db.Column(db.String(16), nullable=False, default="TECH")  # BILLING / TECH

    detail = db.Column(db.String(2000), nullable=False)

    # Estado del reclamo
    status = db.Column(db.String(16), nullable=False, default="TODO")  # TODO / WIP / SOLVED

    solved_at = db.Column(db.DateTime, nullable=True, index=True)

