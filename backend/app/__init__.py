from dotenv import load_dotenv
from flask import Flask
from flask_cors import CORS

from .config import get_config
from .extensions import db, jwt, migrate
from .routes.auth import bp as auth_bp
from .routes.billing import bp as billing_bp
from .routes.clients import bp as clients_bp
from .routes.connections import bp as connections_bp
from .routes.complaints import bp as complaints_bp
from .routes.dashboard import bp as dashboard_bp
from .routes.health import bp as health_bp
from .routes.invoices import bp as invoices_bp
from .routes.jobs import bp as jobs_bp
from .routes.logs import bp as logs_bp
from .routes.network import bp as network_bp
from .routes.payments import bp as payments_bp
from .routes.plans import bp as plans_bp
from .routes.settings import bp as settings_bp
def create_app() -> Flask:
    load_dotenv()

    app = Flask(__name__)
    app.config.from_mapping(get_config())

    # Dev-friendly: permitir al frontend consumir la API
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)

    app.register_blueprint(auth_bp)
    app.register_blueprint(billing_bp)
    app.register_blueprint(clients_bp)
    app.register_blueprint(connections_bp)
    app.register_blueprint(complaints_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(invoices_bp)
    app.register_blueprint(jobs_bp)
    app.register_blueprint(logs_bp)
    app.register_blueprint(network_bp)
    app.register_blueprint(payments_bp)
    app.register_blueprint(plans_bp)
    app.register_blueprint(settings_bp)
    app.register_blueprint(health_bp)
    # Cola de jobs: se arranca en gunicorn_config.post_worker_init (hilo en el mismo proceso).
    return app

