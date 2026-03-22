# Módulo Mikrotik — Patrones de integración

## Archivos

- `ros_client.py` — wrapper sobre `routeros_api` (RouterOsApiPool)
- `../tasks/worker.py` — loop que ejecuta jobs async
- `../tasks/queue.py` — función `enqueue_job()` y constantes de tipos de jobs

## Regla fundamental

**Nunca llamar a `MikrotikRosClient` directamente desde un request HTTP.**

Todas las operaciones en el router se encolan como jobs:

```python
from app.tasks.queue import enqueue_job, JOB_MT_SET_PPP_PROFILE

enqueue_job(
    job_type=JOB_MT_SET_PPP_PROFILE,
    payload={"name": "pppoe_username", "profile": "suspended"},
    server_id=connection.server_id,
)
```

## Por qué usar jobs async

- La conexión TCP al Mikrotik puede tardar o fallar
- Un timeout no debe dejar el request HTTP colgado
- El worker tiene retry automático con backoff exponencial
- Los jobs quedan auditados en la tabla `jobs`

## Tipos de jobs disponibles

| Constante | Qué hace | Payload requerido |
|---|---|---|
| `JOB_MT_CREATE_PPP_SECRET` | Crear usuario PPPoE | `name`, `password`, `profile` |
| `JOB_MT_DELETE_PPP_SECRET` | Eliminar usuario PPPoE | `name` |
| `JOB_MT_SET_PPP_PROFILE` | Cambiar perfil (cortar/restaurar) | `name`, `profile` |
| `JOB_MT_SET_PPP_CREDENTIALS` | Cambiar usuario y/o password | `old_name`, `name`, `password` |
| `JOB_MT_SET_PPP_REMOTE_ADDRESS` | Cambiar IP fija | `name`, `remote_address` |
| `JOB_BILLING_UPDATE_CLIENT_SERVICES` | Evaluar deuda y cortar/restaurar | `client_id` |

## Comportamiento del worker

- Poll cada 2 segundos buscando jobs `PENDING`
- Timeout de 30 segundos por job
- Retry hasta 2 intentos con backoff: 5s, 10s
- Después de 2 intentos fallidos: status `FAILED`
- Jobs `RUNNING` colgados (>35s sin `locked_at` actualizado) se vuelven a `PENDING` automáticamente
- Corre como hilo daemon dentro del proceso Gunicorn (iniciado en `gunicorn_config.post_worker_init`)

## Agregar un nuevo tipo de job

1. Definir la constante en `tasks/queue.py`:
```python
JOB_MI_NUEVO_JOB = "MI_NUEVO_JOB"
```

2. Agregar el handler en `tasks/worker.py` dentro de `_execute_job()`:
```python
if j.job_type == JOB_MI_NUEVO_JOB:
    _require_keys(payload, ["campo1", "campo2"], j.job_type)
    mt.mi_nuevo_metodo(campo1=payload["campo1"], ...)
    return {"status": "done"}
```

3. Si requiere un nuevo método en el cliente RouterOS, agregarlo en `ros_client.py`.

## MikrotikRosClient — métodos disponibles

- `connect()` / `close()` — gestión de conexión TCP
- `list_pppoe_secrets()` — listar usuarios PPPoE
- `add_pppoe_secret(name, password, profile, service, remote_address)` — crear usuario
- `remove_pppoe_secret(name)` — eliminar usuario
- `set_pppoe_secret_profile(name, profile)` — cambiar perfil
- `set_pppoe_secret_credentials(old_name, new_name, new_password)` — cambiar credenciales
- `set_pppoe_secret_remote_address(name, remote_address)` — cambiar IP fija
- `disconnect_pppoe_session(name)` — forzar reconexión (para que el nuevo perfil se aplique)
- `get_active_pppoe_sessions()` — listar sesiones activas
- `get_pppoe_secret(name)` — obtener un secret específico

## Múltiples servidores Mikrotik

Los servidores se gestionan en la tabla `mikrotik_servers`. Cada `Connection` tiene un `server_id`.
Al encolar un job, pasar el `server_id` correspondiente. El worker resuelve el servidor desde la DB.
