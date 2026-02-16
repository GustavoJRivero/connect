FROM python:3.12-slim

WORKDIR /app

# Dependencias del sistema para PyMySQL y compilación
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc default-libmysqlclient-dev && \
    rm -rf /var/lib/apt/lists/*

# Instalar dependencias Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

# Copiar código fuente
COPY . .

EXPOSE 5001

# Script de entrada: aplica migraciones y levanta gunicorn (normalizar CRLF→LF)
COPY entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
