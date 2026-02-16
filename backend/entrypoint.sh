#!/bin/bash
set -e

echo "Esperando a que MySQL esté disponible..."
for i in $(seq 1 30); do
    python -c "
import pymysql, os, sys
from urllib.parse import urlparse
url = os.environ.get('DATABASE_URL','')
try:
    # Formato: mysql+pymysql://user:pass@host:port/db
    parsed = urlparse(url)
    pymysql.connect(
        host=parsed.hostname or 'db',
        port=parsed.port or 3306,
        user=parsed.username or 'root',
        password=parsed.password or '',
        connect_timeout=3
    )
    sys.exit(0)
except Exception:
    sys.exit(1)
" && break
    echo "  MySQL no listo, reintentando ($i/30)..."
    sleep 2
done

echo "Aplicando migraciones..."
export FLASK_APP=wsgi.py
flask db upgrade

echo "Iniciando servidor (1 worker de Gunicorn + hilo de cola de jobs en el mismo proceso)..."
exec gunicorn wsgi:app \
    --config gunicorn_config.py \
    --bind 0.0.0.0:5001 \
    --workers 1 \
    --timeout 120 \
    --access-logfile - \
    --error-logfile -
