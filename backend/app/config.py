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
    # Duración del access token JWT (minutos). Default: 12 horas.
    try:
        jwt_access_minutes = int(os.getenv("JWT_ACCESS_TOKEN_MINUTES", "720"))
    except ValueError:
        jwt_access_minutes = 720
    if jwt_access_minutes <= 0:
        jwt_access_minutes = 720

    environment = os.getenv("FLASK_ENV", "development").strip().lower()
    secret_key = os.getenv("SECRET_KEY", "change-me")
    jwt_secret_key = os.getenv("JWT_SECRET_KEY", "change-me-too")
    insecure_secrets = {
        "change-me",
        "change-me-too",
        "change-me-in-production",
        "genera-una-clave-segura-aqui",
        "genera-otra-clave-segura-aqui",
    }
    if environment == "production" and (
        secret_key in insecure_secrets
        or jwt_secret_key in insecure_secrets
        or len(secret_key) < 32
        or len(jwt_secret_key) < 32
    ):
        raise ValueError("SECRET_KEY y JWT_SECRET_KEY deben ser claves únicas de al menos 32 caracteres en producción.")

    # Sin CORS_ORIGINS en producción no se habilita ningún origen cruzado. El panel y el
    # portal se sirven bajo el mismo dominio que la API, así que siguen funcionando; solo
    # hace falta configurarlo si el frontend vive en otro dominio. "*" nunca se acepta.
    raw_cors = os.getenv("CORS_ORIGINS", "").strip()
    if not raw_cors and environment != "production":
        raw_cors = "http://localhost:3000"
    cors_origins = [value.strip() for value in raw_cors.split(",") if value.strip() and value.strip() != "*"]
    try:
        proxy_fix_x_for = max(0, int(os.getenv("PROXY_FIX_X_FOR", "0")))
    except ValueError:
        proxy_fix_x_for = 0
    recaptcha_site_key = os.getenv("RECAPTCHA_SITE_KEY", "").strip()
    recaptcha_secret_key = os.getenv("RECAPTCHA_SECRET_KEY", "").strip()
    bootstrap_token = os.getenv("BOOTSTRAP_TOKEN", "").strip()
    mp_webhook_secret = os.getenv("MP_WEBHOOK_SECRET", "").strip()
    try:
        recaptcha_min_score = float(os.getenv("RECAPTCHA_MIN_SCORE", "0.5"))
    except ValueError:
        recaptcha_min_score = 0.5
    recaptcha_min_score = max(0.0, min(recaptcha_min_score, 1.0))
    # RECAPTCHA_*, BOOTSTRAP_TOKEN y MP_WEBHOOK_SECRET son opcionales: sin ellos el
    # arranque no falla, pero la función que dependen queda cerrada (el captcha no se
    # exige, el bootstrap se deshabilita y el webhook de MP rechaza las notificaciones).

    return {
        "APP_ENV": environment,
        "SECRET_KEY": secret_key,
        "JWT_SECRET_KEY": jwt_secret_key,
        "JWT_TOKEN_LOCATION": ["headers"],
        "JWT_ACCESS_TOKEN_EXPIRES": timedelta(minutes=jwt_access_minutes),
        "CORS_ORIGINS": cors_origins,
        "PROXY_FIX_X_FOR": proxy_fix_x_for,
        "RECAPTCHA_SITE_KEY": recaptcha_site_key,
        "RECAPTCHA_SECRET_KEY": recaptcha_secret_key,
        "RECAPTCHA_MIN_SCORE": recaptcha_min_score,
        "BOOTSTRAP_TOKEN": bootstrap_token,
        "SQLALCHEMY_DATABASE_URI": database_url,
        "SQLALCHEMY_TRACK_MODIFICATIONS": False,
        "MAX_CONTENT_LENGTH": int(os.getenv("MAX_CONTENT_LENGTH", str(50 * 1024 * 1024))),
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
        "MP_WEBHOOK_SECRET": mp_webhook_secret,
        "API_PUBLIC_URL": os.getenv("API_PUBLIC_URL", "").strip(),
        "PORTAL_PUBLIC_URL": os.getenv("PORTAL_PUBLIC_URL", "http://localhost").strip(),
        # Staging: bloquear escrituras a Mikrotik (PPPoE, perfiles, cortes/restauraciones).
        "MIKROTIK_WRITES_DISABLED": os.getenv("MIKROTIK_WRITES_DISABLED", "").strip(),
        # IPs/hostnames de Mikrotik de producción (coma-separados) para avisos en migración.
        "MIKROTIK_PROD_HOSTS": os.getenv("MIKROTIK_PROD_HOSTS", "").strip(),
    }

