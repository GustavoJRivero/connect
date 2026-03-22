# SistemaConnect — Contexto general del proyecto

## Qué es este proyecto

Sistema de gestión para un ISP (proveedor de internet) orientado al mercado argentino.
Administra clientes, conexiones PPPoE via Mikrotik, facturación electrónica (AFIP), pagos y reclamos.

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Python 3.10+ / Flask / SQLAlchemy / Alembic |
| Base de datos | MySQL 8 |
| Frontend | React 18 + TypeScript / AdminLTE / Mantine |
| Mikrotik | routeros_api (RouterOS API TCP puerto 8728) |
| AFIP | SOAP WSFE (facturación electrónica AR) |
| Despliegue | Docker Compose (db:3307, backend:5001, frontend:80) |

## Estructura

```
connect/
  backend/          # API Flask (ver backend/CLAUDE.md)
  frontend/         # SPA React (ver frontend/CLAUDE.md)
  docker-compose.yml
  .env.example      # copiar a .env antes de levantar
```

## Cómo levantar (desarrollo)

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # ajustar DATABASE_URL etc.
flask db upgrade
python run.py          # corre en localhost:5001

# Frontend (otra terminal)
cd frontend
npm install
npm start              # corre en localhost:3000
```

## Variables de entorno críticas

```env
DATABASE_URL=mysql+pymysql://root:root@127.0.0.1:3306/sistemaconnect
SECRET_KEY=...
JWT_SECRET_KEY=...
MERCADOPAGO_ACCESS_TOKEN=...        # para la integración MP
MERCADOPAGO_WEBHOOK_SECRET=...      # para validar webhooks de MP
AFIP_CUIT=...
AFIP_CERT_PATH=...
AFIP_KEY_PATH=...
AFIP_ENV=HOMOLOGACION               # o PRODUCCION
```

## Convenciones globales

- Todos los endpoints van bajo `/api/...`
- Autenticación: JWT Bearer token. El frontend lo guarda en `localStorage` como `sc_token`
- Fechas siempre en ISO 8601 (`YYYY-MM-DD` o `YYYY-MM-DDTHH:MM:SS`)
- Moneda: ARS, decimales con `Decimal` en Python (nunca `float` para dinero)
- Los IDs son `BigInteger` en la DB
- Soft delete: usar `is_deleted=True` + `deleted_at`, nunca borrar registros fiscales

## Módulos del sistema

| Módulo | Archivos clave |
|---|---|
| Clientes | `models/client.py`, `routes/clients.py` |
| Conexiones PPPoE | `models/connection.py`, `routes/connections.py` |
| Facturación | `billing/engine.py`, `billing/service_status.py`, `routes/billing.py` |
| Pagos | `models/payment.py`, `routes/payments.py` |
| Mikrotik | `mikrotik/ros_client.py`, `tasks/worker.py`, `tasks/queue.py` |
| AFIP | `afip/wsfe.py` |
| Mercado Pago | `mercadopago/` (a implementar) |
| Jobs async | `models/job.py`, `tasks/queue.py`, `tasks/worker.py` |
| Configuración | `models/setting.py`, `routes/settings.py` |
| Logs | `models/system_log.py`, `logging_utils.py`, `routes/logs.py` |
