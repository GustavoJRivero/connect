from datetime import datetime

from ..extensions import db


# Estados de una orden de instalación:
#   PENDIENTE     — creada pero sin chequeo/reserva efectiva (ej: API de mapas no
#                   configurada o caída). Se puede reintentar el chequeo.
#   RESERVADO     — hay cobertura y se reservó un puerto en el NAP más cercano.
#   SIN_COBERTURA — el mapa indicó que no hay red en la ubicación. Queda en el
#                   apartado "Sin cobertura" para retomarla cuando haya expansión.
#   INSTALADA     — la app de mapas (o un operador) confirmó la instalación.
#   VENCIDA       — venció el plazo de espera; el cron liberó el puerto reservado.
#   CANCELADA     — cancelada manualmente (si tenía reserva, se libera).
STATUS_PENDIENTE = "PENDIENTE"
STATUS_RESERVADO = "RESERVADO"
STATUS_SIN_COBERTURA = "SIN_COBERTURA"
STATUS_INSTALADA = "INSTALADA"
STATUS_VENCIDA = "VENCIDA"
STATUS_CANCELADA = "CANCELADA"

ALL_STATUSES = (
    STATUS_PENDIENTE,
    STATUS_RESERVADO,
    STATUS_SIN_COBERTURA,
    STATUS_INSTALADA,
    STATUS_VENCIDA,
    STATUS_CANCELADA,
)


class InstallationOrder(db.Model):
    """Orden de instalación (ticket para el técnico) ligada a una conexión.

    Se crea al dar de alta la solicitud/conexión y guarda el resultado de la
    consulta a la API de mapas (disponibilidad, NAP más cercano, metros de
    fibra y ruta) más el ciclo de vida de la reserva del puerto.
    """

    __tablename__ = "installation_orders"

    id = db.Column(db.BigInteger, primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)

    client_id = db.Column(db.BigInteger, db.ForeignKey("clients.id"), nullable=False, index=True)
    connection_id = db.Column(db.BigInteger, db.ForeignKey("connections.id"), nullable=True, index=True)

    # Ubicación de la solicitud: link original (Google Maps o texto) y/o lat/lng.
    location_url = db.Column(db.String(1000), nullable=True)
    latitude = db.Column(db.Numeric(10, 7), nullable=True)
    longitude = db.Column(db.Numeric(10, 7), nullable=True)

    status = db.Column(db.String(20), nullable=False, default=STATUS_PENDIENTE, index=True)

    # NAP elegido (primera opción disponible que devuelve el mapa = la más cercana).
    nap_ref = db.Column(db.String(120), nullable=True)   # id del feature en el mapa
    nap_name = db.Column(db.String(200), nullable=True)

    # Cálculo de instalación.
    fiber_meters = db.Column(db.Numeric(10, 2), nullable=True)

    # Snapshots crudos de la API (JSON string) para el ticket y auditoría.
    availability_json = db.Column(db.Text, nullable=True)
    install_calc_json = db.Column(db.Text, nullable=True)

    # Ciclo de vida de la reserva.
    reserved_at = db.Column(db.DateTime, nullable=True)
    expires_at = db.Column(db.DateTime, nullable=True, index=True)
    confirmed_at = db.Column(db.DateTime, nullable=True)
    expired_at = db.Column(db.DateTime, nullable=True)

    # Si la escritura de la reserva/liberación en el mapa falló, se registra acá.
    last_maps_error = db.Column(db.String(500), nullable=True)

    # Datos operativos del ticket.
    technician = db.Column(db.String(120), nullable=True)
    notes = db.Column(db.String(2000), nullable=True)

    client = db.relationship("Client", lazy="joined")
    connection = db.relationship("Connection", lazy="joined")
