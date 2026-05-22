# Deployment Guide (CI/CD)

CI/CD listo para que cada push a `main` buildee imágenes en **GHCR** y haga deploy automático en el VPS por SSH.

```mermaid
flowchart LR
  Dev[push a main] --> GHA[GitHub Actions]
  GHA -->|build + push| GHCR[(ghcr.io/owner/connect-*)]
  GHA -->|scp + ssh| VPS[VPS Debian]
  subgraph VPS [VPS docker compose]
    Caddy[Caddy proxy] --> FE[frontend nginx]
    Caddy --> BE[backend gunicorn]
    BE --> DB[(MySQL 8 vol mysql_data)]
  end
```

## Archivos del repo

- `.github/workflows/deploy.yml` — workflow de build + deploy.
- `docker-compose.prod.yml` — compose de producción con `image:` (no `build:`).
- `Caddyfile` — reverse proxy: `/api/*` → backend, resto → frontend.
- `deploy.sh` — script en el server que hace pull, up y prune.

## Secrets de GitHub

`Settings → Secrets and variables → Actions → Secrets`:

| Secret             | Valor sugerido                                                 |
|--------------------|----------------------------------------------------------------|
| `SSH_HOST`         | `190.183.252.27`                                               |
| `SSH_PORT`         | `22000`                                                        |
| `SSH_USER`         | `deploy`                                                       |
| `SSH_PRIVATE_KEY`  | clave privada OpenSSH del usuario `deploy` (incluye `-----BEGIN OPENSSH PRIVATE KEY-----`) |
| `DEPLOY_PATH`      | `/opt/connect`                                                 |

## Variables de GitHub (no secretos)

`Settings → Secrets and variables → Actions → Variables`:

| Variable                  | Valor                                                                      |
|---------------------------|----------------------------------------------------------------------------|
| `REACT_APP_API_BASE_URL`  | dejar **vacío** para que el frontend use `/api` mismo origen (vía Caddy). |

> Si más adelante el backend va por subdominio aparte (`api.midominio.com`), poné ahí esa URL completa.

El nombre del repo se toma de `${{ github.repository }}` y se convierte a minúsculas para GHCR. Para `GustavoJRivero/connect` queda:

- `ghcr.io/gustavojrivero/connect-backend`
- `ghcr.io/gustavojrivero/connect-frontend`

Ambas imágenes se publican con tag `latest` y con `tag = sha corto` para rollback.

## Setup en el VPS (Debian 12, una sola vez)

Como root o con sudo:

```bash
# 1. Docker oficial
apt-get update
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 2. Usuario deploy con acceso a Docker
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy

# 3. SSH key del workflow (pegar la pública en authorized_keys)
mkdir -p /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
# nano /home/deploy/.ssh/authorized_keys   # pegar la clave pública del par usado en SSH_PRIVATE_KEY
chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh

# 4. Carpeta del proyecto
mkdir -p /opt/connect/secrets
chown -R deploy:deploy /opt/connect

# 5. Firewall: abrir el puerto que use Caddy
#    (si usás ufw)
ufw allow 22000/tcp
ufw allow 8088/tcp
# ufw allow 44333/tcp  # solo si vas a usar HTTPS por ese puerto
```

Generar el par de claves (en tu máquina), si todavía no existe:

```bash
ssh-keygen -t ed25519 -C "github-actions-connect" -f ~/.ssh/connect_deploy
# - ~/.ssh/connect_deploy        → contenido va al secret SSH_PRIVATE_KEY
# - ~/.ssh/connect_deploy.pub    → va a /home/deploy/.ssh/authorized_keys
```

## Archivo `.env` en el VPS

Crear `/opt/connect/.env` (no se versiona). Plantilla:

```env
# Imágenes (las publica GitHub Actions; conviene fijarlas en .env también)
BACKEND_IMAGE=ghcr.io/gustavojrivero/connect-backend
FRONTEND_IMAGE=ghcr.io/gustavojrivero/connect-frontend
IMAGE_TAG=latest

# Puertos publicados por el reverse proxy (host:contenedor)
PROXY_HTTP_PORT=8088
PROXY_HTTPS_PORT=44333

# MySQL
MYSQL_DATABASE=sistemaconnect
MYSQL_USER=root
MYSQL_ROOT_PASSWORD=cambiar-esto

# Backend
FLASK_ENV=production
SECRET_KEY=cambiar-clave-larga-1
JWT_SECRET_KEY=cambiar-clave-larga-2

# AFIP (opcional)
AFIP_ENV=HOMOLOGACION
AFIP_CUIT=
AFIP_CERT_PATH=/app/secrets/cert.pem
AFIP_KEY_PATH=/app/secrets/key.pem

# Mikrotik (opcional)
MIKROTIK_HOST=
MIKROTIK_PORT=8728
MIKROTIK_USER=
MIKROTIK_PASS=
```

Permisos:

```bash
chmod 600 /opt/connect/.env
chown deploy:deploy /opt/connect/.env
```

Si el repo de GHCR está **privado**, hay que loguear el host una vez:

```bash
echo "<PAT_con_read:packages>" | docker login ghcr.io -u <tu-usuario-github> --password-stdin
```

## Primer deploy manual (smoke test)

Antes del primer push automático conviene probar a mano en el server:

```bash
sudo -iu deploy
cd /opt/connect

# Subir manualmente compose, Caddyfile y deploy.sh la primera vez
# (después el workflow los sobrescribe en cada deploy):
#   scp -P 22000 docker-compose.prod.yml Caddyfile deploy.sh deploy@190.183.252.27:/opt/connect/

chmod +x deploy.sh
./deploy.sh
```

Verificar:

- `docker compose -f docker-compose.prod.yml ps` (todos `running`).
- `curl -I http://localhost:8088/` desde el server.
- `http://190.183.252.27:8088/` desde fuera (recordar abrir el puerto en el firewall del proveedor del VPS, no solo `ufw`).

## Rollback

Cada deploy publica el tag corto del commit. Para volver atrás:

```bash
# desde /opt/connect en el server
IMAGE_TAG=<sha-anterior> ./deploy.sh
```

(El sha aparece en el nombre del run de GitHub Actions y en GHCR como tag.)

## Cuando haya dominio real

1. Apuntar `app.tudominio.com` a `190.183.252.27`.
2. Cambiar en `Caddyfile` el bloque `:80` por:

   ```caddyfile
   app.tudominio.com {
       encode zstd gzip
       handle /api/* { reverse_proxy backend:5001 }
       handle       { reverse_proxy frontend:80 }
   }
   ```

   y quitar `auto_https off`.
3. Si Caddy va a emitir TLS automático, mapear los puertos del proxy a `80:80` y `443:443` en `docker-compose.prod.yml` (o cambiar `PROXY_HTTP_PORT` / `PROXY_HTTPS_PORT` en `.env`) y abrir esos puertos.
4. Re-deploy.

## Notas de seguridad

- No subir `.env` ni claves privadas al repo (revisar `.gitignore`).
- El backend ya no se expone directo al exterior (no tiene `ports:` en `docker-compose.prod.yml`); todo entra por Caddy.
- MySQL queda solo en la red interna del compose; no publica el `3306` ni el `3307`.
- Si compartiste contraseñas reales en chat o issues, rotarlas.
