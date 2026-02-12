"""
Modelo para persistir logs del sistema en base de datos.

Estándar de logging:
  [MÓDULO] [ACCIÓN] mensaje | clave=valor clave=valor

Módulos definidos:
  BILLING   – Facturación automática y manual
  CLIENT    – ABM de clientes
  CONNECTION – ABM de conexiones
  PAYMENT   – Registración de pagos
  INVOICE   – ABM de facturas
  NETWORK   – Servidores Mikrotik y PPPoE
  AUTH      – Autenticación y sesiones
  SYSTEM    – Sistema general (scheduler, migraciones, config)
"""
from datetime import datetime

from ..extensions import db


class SystemLog(db.Model):
    __tablename__ = "system_logs"

    id = db.Column(db.BigInteger, primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)

    # Clasificación
    module = db.Column(db.String(32), nullable=False, index=True)   # BILLING, CLIENT, etc.
    action = db.Column(db.String(64), nullable=False, index=True)   # START, INVOICE_CREATED, etc.
    level = db.Column(db.String(10), nullable=False, default="INFO")  # DEBUG, INFO, WARNING, ERROR

    # Contenido
    message = db.Column(db.Text, nullable=False)

    # Contexto opcional (JSON)
    details = db.Column(db.Text, nullable=True)

    # Relaciones opcionales para filtrado rápido
    ref_id = db.Column(db.BigInteger, nullable=True, index=True)      # ID del objeto relacionado
    ref_type = db.Column(db.String(32), nullable=True)                 # "connection", "client", "invoice", etc.
    user_id = db.Column(db.Integer, nullable=True)                     # Quién disparó la acción (null = sistema)
