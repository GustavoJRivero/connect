# SistemaConnect (ISP Manager)

Sistema para administrar un ISP: API en Python (Flask) + frontend React. Incluye módulos de Clientes, Facturación, Cobranza, Conexión con Mikrotik (PPPoE) y AFIP.

- **backend**: Flask, MySQL, JWT, Flask-Migrate (Alembic).
- **frontend**: React + TypeScript, AdminLTE, react-router-dom.

### Estructura

```
SistemaConnect/
  backend/     # API Flask (puerto 5001)
  frontend/    # React (puerto 3000)
```

---

## Configuración para agentes / Setup desde cero

Cuando un agente o desarrollador clone o abra este proyecto, debe seguir estos pasos en orden.

### 1. Requisitos previos

| Componente | Versión / Notas |
|------------|------------------|
| **MySQL**  | 5.7+ o 8.x. Servicio corriendo (puerto 3306). |
| **Python** | 3.8+ (recomendado 3.10+). Para el backend. |
| **Node.js**| 14+ (recomendado 18+). Para el frontend. `npm` incluido. |

---

### 2. MySQL

- **Instalar MySQL** (si no está instalado):
  - Windows: [MySQL Installer](https://dev.mysql.com/downloads/installer/) o Chocolatey: `choco install mysql`.
  - Linux: `sudo apt install mysql-server` (Debian/Ubuntu) o equivalente.
  - macOS: `brew install mysql`.

- **Iniciar el servicio** (según OS):
  - Windows: Servicios → MySQL; o `net start MySQL`.
  - Linux: `sudo systemctl start mysql`.
  - macOS: `brew services start mysql`.

- **Crear base y usuario** (ejemplo con usuario `root` y contraseña `root`):

```sql
CREATE DATABASE IF NOT EXISTS sistemaconnect
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Si se usa otro usuario/contraseña, crearlo y dar permisos sobre `sistemaconnect`. El proyecto espera por defecto:

- Host: `127.0.0.1`
- Puerto: `3306`
- Base: `sistemaconnect`
- Usuario/contraseña: configurable en `backend/.env` (ej.: `root` / `root`).

---

### 3. Backend (Flask)

- **Ruta**: `backend/`

- **Python y venv**:

```bash
cd backend
python -m venv .venv
```

- **Activar entorno** (Windows PowerShell):

```powershell
.\.venv\Scripts\Activate.ps1
```

(Linux/macOS: `source .venv/bin/activate`)

- **Dependencias**:

```bash
pip install -r requirements.txt
```

- **Variables de entorno**:

  - Copiar `backend/.env.example` a `backend/.env`.
  - Ajustar al menos:
    - `DATABASE_URL=mysql+pymysql://USUARIO:PASSWORD@127.0.0.1:3306/sistemaconnect`
    - `SECRET_KEY` y `JWT_SECRET_KEY` (valores seguros en producción).

  Ejemplo `.env` (desarrollo):

```env
FLASK_ENV=development
FLASK_DEBUG=1
SECRET_KEY=change-me
JWT_SECRET_KEY=change-me-too
DATABASE_URL=mysql+pymysql://root:root@127.0.0.1:3306/sistemaconnect
```

- **Migraciones** (crear tablas en MySQL):

```bash
set FLASK_APP=wsgi.py
flask db upgrade
```

(En Linux/macOS: `export FLASK_APP=wsgi.py`.)

- **Arrancar la API**:

```bash
python run.py
```

La API queda en **http://localhost:5001**. Healthcheck: `GET http://localhost:5001/api/health` → `{"status":"ok"}`.

- **Primer usuario**: Entrar al frontend y en la pantalla de login usar **"Bootstrap admin"** (usuario y contraseña que quieras) para crear el primer admin. Si la base está vacía, no hay login hasta hacer bootstrap.

---

### 4. Frontend (React)

- **Ruta**: `frontend/`

- **Dependencias**:

```bash
cd frontend
npm install
```

- **URL de la API** (opcional): Por defecto el frontend usa `http://localhost:5001`. Para otro host/puerto, crear `frontend/.env` con:

```env
REACT_APP_API_BASE_URL=http://localhost:5001
```

- **Arrancar**:

```bash
npm start
```

Abre **http://localhost:3000**. El login consume la API del backend (JWT).

---

### 5. Verificación rápida

1. MySQL: base `sistemaconnect` existe y el usuario tiene permisos.
2. Backend: `curl http://localhost:5001/api/health` → 200 y `{"status":"ok"}`.
3. Frontend: abrir http://localhost:3000 → pantalla de login.
4. Login: usar "Bootstrap admin" si es la primera vez; luego "Login" con ese usuario.

---

### 6. Configuración opcional (backend)

- **AFIP** (facturación electrónica): En `.env`, `AFIP_CUIT`, `AFIP_CERT_PATH`, `AFIP_KEY_PATH`, `AFIP_ENV` (HOMOLOGACION/PRODUCCION). Sin certificados la app funciona; la integración AFIP queda preparada.
- **Mikrotik** (PPPoE): Se configuran los servidores desde la app (Red → servidores). Las variables `MIKROTIK_*` en `.env` son legacy; los equipos se gestionan por la base de datos.

---

### Resumen de comandos (desarrollo)

```bash
# Terminal 1 - Backend
cd backend
.\.venv\Scripts\activate
set FLASK_APP=wsgi.py
flask db upgrade   # solo la primera vez
python run.py

# Terminal 2 - Frontend
cd frontend
npm start
```

Documentación detallada de la API: ver `backend/README.md`.
