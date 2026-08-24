import os
from datetime import timedelta


def get_config() -> dict:
    """
    Lee configuración desde variables de entorno.

    Importante: esto se llama DESPUÉS de `load_dotenv()` para que tome `.env`.
    """
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        raise ValueError(
            "DATABASE_URL es obligatorio. Ejemplo: mysql+pymysql://root:root@127.0.0.1:3306/sistemaconnect"
        )
    if not database_url.startswith("mysql"):
        raise ValueError(
            "Este proyecto usa solo MySQL. Configurá DATABASE_URL con mysql+pymysql://..."
        )
    # Duración del access token JWT (minutos). Default: 60.
    try:
        jwt_access_minutes = int(os.getenv("JWT_ACCESS_TOKEN_MINUTES", "60"))
    except ValueError:
        jwt_access_minutes = 60
    if jwt_access_minutes <= 0:
        jwt_access_minutes = 60

    return {
        "SECRET_KEY": os.getenv("SECRET_KEY", "change-me"),
        "JWT_SECRET_KEY": os.getenv("JWT_SECRET_KEY", "change-me-too"),
        "JWT_TOKEN_LOCATION": ["headers", "query_string"],
        "JWT_QUERY_STRING_NAME": "jwt",
        "JWT_ACCESS_TOKEN_EXPIRES": timedelta(minutes=jwt_access_minutes),
        "SQLALCHEMY_DATABASE_URI": database_url,
        "SQLALCHEMY_TRACK_MODIFICATIONS": False,
        "MAX_CONTENT_LENGTH": int(os.getenv("MAX_CONTENT_LENGTH", str(600 * 1024 * 1024))),
        # AFIP
        "AFIP_ENV": os.getenv("AFIP_ENV", "HOMOLOGACION"),
        "AFIP_CUIT": os.getenv("AFIP_CUIT"),
        "AFIP_CERT_PATH": os.getenv("AFIP_CERT_PATH"),
        "AFIP_KEY_PATH": os.getenv("AFIP_KEY_PATH"),
        # Mikrotik
        "MIKROTIK_HOST": os.getenv("MIKROTIK_HOST"),
        "MIKROTIK_PORT": int(os.getenv("MIKROTIK_PORT", "8728")),
        "MIKROTIK_USER": os.getenv("MIKROTIK_USER"),
        "MIKROTIK_PASS": os.getenv("MIKROTIK_PASS"),
        # Background worker (cola de jobs)
        "TASK_WORKER_ENABLED": os.getenv("TASK_WORKER_ENABLED", "true"),
        "TASK_WORKER_POLL_SECONDS": float(os.getenv("TASK_WORKER_POLL_SECONDS", "2")),
        # Connect Maps API (disponibilidad de red / cálculo de instalación / reserva de NAP)
        "MAPS_API_BASE_URL": os.getenv("MAPS_API_BASE_URL", "https://maps.connectsrl.ar").strip(),
        "MAPS_API_KEY": os.getenv("MAPS_API_KEY", "").strip(),
        # Secret compartido para el webhook de confirmación de instalación
        "MAPS_WEBHOOK_SECRET": os.getenv("MAPS_WEBHOOK_SECRET", "").strip(),
        # Mercado Pago (portal de cliente)
        "MP_ACCESS_TOKEN": os.getenv("MP_ACCESS_TOKEN", "").strip(),
        "MP_PUBLIC_KEY": os.getenv("MP_PUBLIC_KEY", "").strip(),
        "MP_WEBHOOK_URL": os.getenv("MP_WEBHOOK_URL", "").strip(),
        "API_PUBLIC_URL": os.getenv("API_PUBLIC_URL", "").strip(),
        "PORTAL_PUBLIC_URL": os.getenv("PORTAL_PUBLIC_URL", "http://localhost").strip(),
        # Staging: bloquear escrituras a Mikrotik (PPPoE, perfiles, cortes/restauraciones).
        "MIKROTIK_WRITES_DISABLED": os.getenv("MIKROTIK_WRITES_DISABLED", "").strip(),
        # IPs/hostnames de Mikrotik de producción (coma-separados) para avisos en migración.
        "MIKROTIK_PROD_HOSTS": os.getenv("MIKROTIK_PROD_HOSTS", "").strip(),
    }

