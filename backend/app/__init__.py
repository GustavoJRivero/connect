import os
import time as _time

from dotenv import load_dotenv
from flask import Flask
from flask_cors import CORS

from .config import get_config
from .extensions import db, jwt, migrate
from .timezone import get_app_tz_name
from .routes.auth import bp as auth_bp
from .routes.billing import bp as billing_bp
from .routes.clients import bp as clients_bp
from .routes.connections import bp as connections_bp
from .routes.complaints import bp as complaints_bp
from .routes.dashboard import bp as dashboard_bp
from .routes.health import bp as health_bp
from .routes.installations import bp as installations_bp, webhook_bp as maps_webhook_bp
from .routes.invoices import bp as invoices_bp
from .routes.jobs import bp as jobs_bp
from .routes.logs import bp as logs_bp
from .routes.network import bp as network_bp
from .routes.payments import bp as payments_bp
from .routes.plans import bp as plans_bp
from .routes.settings import bp as settings_bp
from .routes.portal import bp as portal_bp
from .routes.mp_webhook import bp as mp_webhook_bp
def create_app() -> Flask:
    load_dotenv()

    # Aplicamos la TZ configurada al proceso para que `date.today()` / `datetime.now()`
    # también respeten APP_TIMEZONE (por defecto America/Argentina/Buenos_Aires).
    tz_name = get_app_tz_name()
    os.environ.setdefault("TZ", tz_name)
    if hasattr(_time, "tzset"):
        try:
            _time.tzset()
        except Exception:
            pass

    app = Flask(__name__)
    app.config.from_mapping(get_config())

    # Dev-friendly: permitir al frontend consumir la API
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)

    from . import models as _models  # noqa: F401

    app.register_blueprint(auth_bp)
    app.register_blueprint(billing_bp)
    app.register_blueprint(clients_bp)
    app.register_blueprint(connections_bp)
    app.register_blueprint(complaints_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(installations_bp)
    app.register_blueprint(maps_webhook_bp)
    app.register_blueprint(invoices_bp)
    app.register_blueprint(jobs_bp)
    app.register_blueprint(logs_bp)
    app.register_blueprint(network_bp)
    app.register_blueprint(payments_bp)
    app.register_blueprint(plans_bp)
    app.register_blueprint(settings_bp)
    app.register_blueprint(health_bp)
    app.register_blueprint(portal_bp)
    app.register_blueprint(mp_webhook_bp)

    from sqlalchemy.exc import DataError, IntegrityError
    from flask import jsonify

    @app.errorhandler(DataError)
    def _data_error(_e):
        try:
            db.session.rollback()
        except Exception:
            pass
        return jsonify({"error": "invalid_data", "message": "Uno de los datos supera el largo máximo permitido."}), 400

    @app.errorhandler(IntegrityError)
    def _integrity_error(_e):
        try:
            db.session.rollback()
        except Exception:
            pass
        return jsonify({"error": "conflict", "message": "La operación entra en conflicto con datos existentes."}), 409

    from .mikrotik.guard import MikrotikWritesDisabledError

    @app.errorhandler(MikrotikWritesDisabledError)
    def _mikrotik_writes_disabled(e):
        try:
            db.session.rollback()
        except Exception:
            pass
        return e.to_response()

    # Jobs + scheduler de facturación: gunicorn_config.post_worker_init (hilos en el mismo proceso).
    return app

