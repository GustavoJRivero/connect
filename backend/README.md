## Backend (Flask API)

### Requisitos

- Python 3.14+ recomendado (mínimo: 3.8 por Flask 3)
- MySQL

### Setup rápido

1. Crear entorno virtual e instalar dependencias:

```bash
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

1. Configurar variables:

- Copiar `backend/.env.example` a `backend/.env`
- En `.env` usar MySQL, por ejemplo:  
`DATABASE_URL=mysql+pymysql://root:root@127.0.0.1:3306/sistemaconnect`

1. MySQL: crear la base `sistemaconnect` y aplicar migraciones:

```bash
cd backend
# Crear la base (en MySQL: CREATE DATABASE IF NOT EXISTS sistemaconnect;)
set FLASK_APP=wsgi.py
.\.venv\Scripts\flask db upgrade
```

1. Ejecutar:

```bash
python run.py
```

La primera vez que entres al login, usá **"Bootstrap admin"** para crear el primer usuario (si la base está vacía).

Healthcheck:

- `GET /api/health`

### Endpoints iniciales

- **Auth**
  - `POST /api/auth/bootstrap` (crear primer admin si no existe)
  - `POST /api/auth/login` (JWT)
  - `GET /api/auth/me`
- **Clientes**
  - `POST /api/clients` (crea cliente + conexiones + crea PPPoE secrets en Mikrotik)
  - `GET /api/clients`
  - `GET /api/clients/<id>`
  - `PUT /api/clients/<id>`
  - `DELETE /api/clients/<id>`
- **Conexiones**
  - `POST /api/connections` (agrega conexión a un cliente + crea PPPoE secret)
  - `PUT /api/connections/<id>` (edita conexión; si está activa sync Mikrotik)
  - `POST /api/connections/<id>/cut` (aplica profile `suspended` por defecto)
  - `POST /api/connections/<id>/restore` (vuelve al profile del plan)
  - `DELETE /api/connections/<id>`
- **Settings**
  - `GET /api/settings/issuer` (CUIT + punto de venta)
  - `PUT /api/settings/issuer`
  - `GET /api/settings/kv?prefix=...` (settings genéricos por prefijo)
  - `PUT /api/settings/kv` (guardar settings en lote)
- **Facturación**
  - `POST /api/invoices` (crea factura DRAFT)
  - `POST /api/invoices/<id>/issue` (emite: numeración interna por ahora)
  - `GET /api/invoices`
- **Pagos / Cobranza**
  - `POST /api/payments` (registra pago e imputa a facturas ISSUED)
  - `GET /api/payments`
  - `POST /api/billing/generate` (genera facturas por conexión según plan)
  - `POST /api/billing/enforce` (corta/restaura según vencidas impagas)

