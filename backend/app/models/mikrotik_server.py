import json
from datetime import datetime
from typing import List

from ..extensions import db


# Tope de cantidad de pools por server (UI limita el selector a este valor).
MAX_IP_POOLS_PER_SERVER = 5


class MikrotikServer(db.Model):
    __tablename__ = "mikrotik_servers"

    id = db.Column(db.BigInteger, primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    name = db.Column(db.String(120), nullable=False, unique=True, index=True)

    host = db.Column(db.String(255), nullable=False)
    port = db.Column(db.Integer, nullable=False, default=8728)
    username = db.Column(db.String(128), nullable=False)
    password = db.Column(db.String(255), nullable=False)
    use_ssl = db.Column(db.Boolean, nullable=False, default=False)

    # IP del router que se inyecta como `local-address` en /ppp/profile (gateway PPPoE).
    # Si está vacío no se setea y RouterOS toma su default.
    local_address = db.Column(db.String(64), nullable=True)

    # Pools de IPs gestionados por la app. Almacenado como JSON-string con una lista de CIDRs IPv4.
    # Ej.: '["10.0.0.0/24", "10.0.1.0/24"]'. Hasta MAX_IP_POOLS_PER_SERVER entradas.
    # Cuando se crea/edita una conexión sin IP explícita, se autoasigna la próxima libre
    # iterando los pools en el orden cargado. La app no replica los pools al RouterOS.
    ip_pool_cidrs = db.Column(db.Text, nullable=True)

    def get_pool_cidrs(self) -> List[str]:
        """Lista de CIDRs (strings) configurados para este server, normalizada y sin duplicados."""
        raw = (self.ip_pool_cidrs or "").strip()
        if not raw:
            return []
        try:
            data = json.loads(raw)
        except (TypeError, ValueError):
            # Compat: si por alguna razón quedó un string suelto, lo tomamos como un único CIDR.
            return [raw]
        if not isinstance(data, list):
            return []
        out: List[str] = []
        seen = set()
        for v in data:
            if not isinstance(v, str):
                continue
            s = v.strip()
            if not s or s in seen:
                continue
            seen.add(s)
            out.append(s)
        return out[:MAX_IP_POOLS_PER_SERVER]

    def set_pool_cidrs(self, cidrs: List[str]) -> None:
        """Persiste la lista (acepta str sueltos vacíos, los filtra)."""
        clean: List[str] = []
        seen = set()
        for v in cidrs or []:
            if not isinstance(v, str):
                continue
            s = v.strip()
            if not s or s in seen:
                continue
            seen.add(s)
            clean.append(s)
            if len(clean) >= MAX_IP_POOLS_PER_SERVER:
                break
        self.ip_pool_cidrs = json.dumps(clean) if clean else None

