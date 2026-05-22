# SistemaConnect (ISP Manager)

Sistema para administrar un ISP: API en Python (Flask) + frontend React. Incluye módulos de Clientes, Facturación, Cobranza, Conexión con Mikrotik (PPPoE) y AFIP.

- **backend**: Flask, MySQL, JWT, Flask-Migrate (Alembic).
- **frontend**: React + TypeScript, AdminLTE, react-router-dom.
- **despliegue**: Docker Compose (MySQL 8, Gunicorn, Nginx).

### Estructura

```
SistemaConnect/
  backend/            # API Flask (puerto 5001)
  frontend/           # React (puerto 80 en producción, 3000 en desarrollo)
  docker-compose.yml  # Orquestación de contenedores
  .env.example        # Variables de entorno (copiar a .env)
```

---

## Opción A: Despliegue con Docker Compose (recomendado)

La forma más rápida de levantar todo el sistema. Solo se necesita **Docker** y **Docker Compose**.

### 1. Requisitos previos


| Componente | Versión / Notas                         |
| ---------- | --------------------------------------- |
| **Docker** | 20.10+ con Docker Compose V2 integrado. |


> Si tenés MySQL corriendo en el host en el puerto 3306, no hay conflicto: el contenedor de MySQL expone el puerto **3307** en el host.

### 2. Variables de entorno

Copiar el archivo de ejemplo y ajustar los valores:

```bash
cp .env.example .env
```

Editar `.env` con los valores deseados. Las variables principales:

```env
# MySQL
MYSQL_ROOT_PASSWORD=root
MYSQL_USER=root

# Backend
SECRET_KEY=genera-una-clave-segura-aqui
JWT_SECRET_KEY=genera-otra-clave-segura-aqui

# Frontend - URL donde el navegador accede al backend
REACT_APP_API_BASE_URL=http://localhost:5001
```

### 3. Levantar los contenedores

```bash
docker compose up -d --build
```

Esto levanta tres servicios:


| Servicio     | Puerto en host | Descripción               |
| ------------ | -------------- | ------------------------- |
| **db**       | 3307           | MySQL 8.0 (interno: 3306) |
| **backend**  | 5001           | API Flask + Gunicorn      |
| **frontend** | 80             | React compilado + Nginx   |


El backend espera a que MySQL esté listo, aplica las migraciones automáticamente y luego inicia Gunicorn.

### 4. Acceder al sistema

1. Abrir **[http://localhost](http://localhost)** (puerto 80) en el navegador.
2. En la pantalla de login, hacer clic en **"Cambiar a Bootstrap"**.
3. Elegir un usuario y contraseña para el primer admin, luego **"Crear admin + Entrar"**.

### 5. Verificación

```bash
# Estado de los contenedores
docker compose ps

# Logs del backend
docker compose logs backend --tail 20

# Health check
curl http://localhost:5001/api/health
# → {"status":"ok"}
```

### 6. Comandos útiles

```bash
# Parar todos los servicios
docker compose down

# Parar y eliminar volúmenes (resetear base de datos)
docker compose down -v

# Reconstruir solo el backend después de cambios
docker compose up -d --build backend

# Reconstruir solo el frontend después de cambios
docker compose up -d --build frontend

# Ver logs en tiempo real
docker compose logs -f
```

### 7. Conexión externa a la base de datos

Para conectarse desde herramientas como DBeaver o MySQL Workbench:


| Parámetro  | Valor                   |
| ---------- | ----------------------- |
| Host       | `127.0.0.1`             |
| Puerto     | `3307`                  |
| Base       | `sistemaconnect`        |
| Usuario    | `root`                  |
| Contraseña | (la definida en `.env`) |


---

## Opción B: Desarrollo local (sin Docker)

Para desarrollo con hot-reload en frontend y backend.

### 1. Requisitos previos


| Componente  | Versión / Notas                                          |
| ----------- | -------------------------------------------------------- |
| **MySQL**   | 5.7+ o 8.x. Servicio corriendo (puerto 3306).            |
| **Python**  | 3.8+ (recomendado 3.10+). Para el backend.               |
| **Node.js** | 14+ (recomendado 18+). Para el frontend. `npm` incluido. |


### 2. MySQL

- **Instalar MySQL** (si no está instalado):
  - Windows: [MySQL Installer](https://dev.mysql.com/downloads/installer/) o Chocolatey: `choco install mysql`.
  - Linux: `sudo apt install mysql-server` (Debian/Ubuntu) o equivalente.
  - macOS: `brew install mysql`.
- **Crear la base de datos**:

```sql
CREATE DATABASE IF NOT EXISTS sistemaconnect
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 3. Backend (Flask)

```bash
cd backend
python -m venv .venv
```

- **Activar entorno**:

```powershell
# Windows PowerShell
.\.venv\Scripts\Activate.ps1

# Linux/macOS
source .venv/bin/activate
```

- **Dependencias**:

```bash
pip install -r requirements.txt
```

- **Variables de entorno**: Copiar `backend/.env.example` a `backend/.env` y ajustar:

```env
FLASK_ENV=development
FLASK_DEBUG=1
SECRET_KEY=change-me
JWT_SECRET_KEY=change-me-too
DATABASE_URL=mysql+pymysql://root:root@127.0.0.1:3306/sistemaconnect
```

- **Migraciones y arranque**:

```bash
set FLASK_APP=wsgi.py        # Windows
export FLASK_APP=wsgi.py     # Linux/macOS

flask db upgrade
python run.py
```

La API queda en **[http://localhost:5001](http://localhost:5001)**. Healthcheck: `GET /api/health` → `{"status":"ok"}`.

### 4. Frontend (React)

```bash
cd frontend
npm install
npm start
```

Abre **[http://localhost:3000](http://localhost:3000)**. Por defecto se conecta al backend en `http://localhost:5001`.

Para otra URL de backend, crear `frontend/.env`:

```env
REACT_APP_API_BASE_URL=http://localhost:5001
```

### 5. Primer usuario

En la pantalla de login, usar **"Cambiar a Bootstrap"** para crear el primer admin con el usuario y contraseña que quieras.

---

## Configuración opcional

- **AFIP** (facturación electrónica): En `.env`, configurar `AFIP_CUIT`, `AFIP_CERT_PATH`, `AFIP_KEY_PATH`, `AFIP_ENV` (HOMOLOGACION/PRODUCCION). Sin certificados la app funciona; la integración AFIP queda preparada.
- **Mikrotik** (PPPoE): Se configuran los servidores desde la app (Red → Servidores). Las variables `MIKROTIK_`* en `.env` son legacy; los equipos se gestionan desde la base de datos.

