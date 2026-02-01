import os


def get_config() -> dict:
    """
    Lee configuración desde variables de entorno.

    Importante: esto se llama DESPUÉS de `load_dotenv()` para que tome `.env`.
    """
    return {
        "SECRET_KEY": os.getenv("SECRET_KEY", "change-me"),
        "JWT_SECRET_KEY": os.getenv("JWT_SECRET_KEY", "change-me-too"),
        "SQLALCHEMY_DATABASE_URI": os.getenv("DATABASE_URL"),
        "SQLALCHEMY_TRACK_MODIFICATIONS": False,
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
    }

