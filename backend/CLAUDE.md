# Backend — Convenciones y patrones

## Stack

- **Flask** con Application Factory (`create_app()` en `app/__init__.py`)
- **SQLAlchemy** como ORM, instancia en `app/extensions.py` (`db`)
- **Flask-Migrate (Alembic)** para migraciones en `migrations/versions/`
- **Flask-JWT-Extended** para autenticación
- **Gunicorn** como servidor WSGI en producción

## Estructura

```
backend/
  app/
    __init__.py          # create_app(), registra blueprints
    config.py            # configuración desde env vars
    extensions.py        # db, jwt, migrate (instancias únicas)
    logging_utils.py     # función slog() para audit log
    models/              # modelos SQLAlchemy
    routes/              # blueprints Flask (un archivo por dominio)
    billing/             # motor de facturación
    mikrotik/            # cliente RouterOS
    afip/                # cliente WSFE
    tasks/               # worker + queue de jobs async
  migrations/versions/   # migraciones Alembic
  run.py                 # entrypoint desarrollo
  wsgi.py                # entrypoint producción (Gunicorn)
  gunicorn_config.py     # arranca el worker thread en post_worker_init
```

## Cómo agregar una nueva route

1. Crear `app/routes/mi_modulo.py` con un Blueprint:

```python
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

bp = Blueprint("mi_modulo", __name__, url_prefix="/api/mi_modulo")

@bp.get("")
@jwt_required(optional=True)
def list_items():
    ...
```

2. Registrar en `app/__init__.py`:

```python
from .routes.mi_modulo import bp as mi_modulo_bp
app.register_blueprint(mi_modulo_bp)
```

## Cómo agregar un nuevo modelo

1. Crear `app/models/mi_modelo.py` con la clase SQLAlchemy
2. Importarlo en `app/models/__init__.py` para que Alembic lo detecte
3. Generar la migración:

```bash
flask db migrate -m "descripcion_breve"
flask db upgrade
```

**Regla:** nunca editar migraciones ya aplicadas en producción. Siempre crear una nueva.

## Sistema de jobs asíncronos

Todas las operaciones en Mikrotik (y tareas lentas) se encolan, NO se ejecutan en el request.

```python
from app.tasks.queue import enqueue_job, JOB_MT_SET_PPP_PROFILE

enqueue_job(
    job_type=JOB_MT_SET_PPP_PROFILE,
    payload={"name": "user1", "profile": "cut"},
    server_id=1,
)
```

Tipos de jobs disponibles (`tasks/queue.py`):
- `JOB_MT_CREATE_PPP_SECRET` — crear usuario PPPoE en Mikrotik
- `JOB_MT_DELETE_PPP_SECRET` — eliminar usuario PPPoE
- `JOB_MT_SET_PPP_PROFILE` — cambiar perfil (cortar/restaurar)
- `JOB_MT_SET_PPP_CREDENTIALS` — cambiar usuario/password
- `JOB_MT_SET_PPP_REMOTE_ADDRESS` — cambiar IP fija
- `JOB_BILLING_UPDATE_CLIENT_SERVICES` — evaluar deuda y cortar/restaurar

Para agregar un nuevo tipo de job:
1. Definir la constante en `tasks/queue.py`
2. Agregar el handler en `tasks/worker.py` dentro de `_execute_job()`

## Logging de auditoría

Usar `slog()` de `logging_utils.py` para registrar eventos importantes en la tabla `system_logs`:

```python
from app.logging_utils import slog

slog(
    module="MERCADOPAGO",          # módulo en mayúsculas
    action="PAYMENT_CONFIRMED",    # acción en mayúsculas
    message="Pago confirmado por MP",
    level="INFO",                  # INFO / WARNING / ERROR / DEBUG
    details={"payment_id": 123, "amount": "5000"},
    ref_id=invoice.id,
    ref_type="invoice",
)
```

## Configuración dinámica (tabla settings)

Leer configuración de la BD (no de env vars) para valores configurables desde la UI:

```python
from app.models.setting import Setting

def _get_setting(key, default=None):
    s = Setting.query.get(key)
    return s.value if s else default

# Ejemplo
due_days = int(_get_setting("billing.due_days", "10"))
```

Claves existentes relevantes:
- `billing.mode` → `GLOBAL` | `INDIVIDUAL`
- `billing.global_day` → día del mes (1-28)
- `billing.due_days` → días de vencimiento
- `issuer.cuit` → CUIT del emisor
- `issuer.point_of_sale` → punto de venta
- `billing.cut_profile` → perfil Mikrotik para corte
- `billing.restore_profile` → prefijo para restaurar

## Patrones importantes

- **Dinero:** siempre usar `Decimal`, nunca `float`
- **Fechas:** `date.today()` o `datetime.utcnow()` en el backend; convertir a ISO en JSON
- **Soft delete:** modelos fiscales (Invoice, Payment) no se borran, se marcan con `is_deleted=True`
- **Idempotencia:** antes de crear cualquier registro de factura, verificar que no exista duplicado
- **CORS:** configurado para `/api/*` con `origins: *` — en producción restringir si es necesario
- **JWT opcional:** muchos endpoints usan `@jwt_required(optional=True)` para permitir acceso desde webhooks sin token
