"""
Pools de IPs por MikrotikServer (gestionados por la app, no replicados al router).

Reglas:
- Cada server puede tener hasta MAX_IP_POOLS_PER_SERVER pools, configurados en
  `MikrotikServer.ip_pool_cidrs` como una lista JSON de CIDRs IPv4
  (ej. '["10.0.0.0/24", "10.0.1.0/24"]').
- Se excluyen automáticamente: network, broadcast y la `local_address` del server
  (si cae en alguno de los rangos).
- IPs "asignadas" = todas las que están en `Connection.ip` para conexiones del mismo
  server, sin importar el estado de la conexión.
- IPs "libres" = todas las del rango menos las asignadas y las reservadas.
- La asignación automática recorre los pools en el orden cargado y devuelve la
  primera IP libre encontrada.
- Al borrar una conexión o desasignar el server (`server_id=None`) la IP vuelve al pool.
"""
from __future__ import annotations

import ipaddress
from typing import Iterable, List, Optional, Set

from ..extensions import db
from ..models.connection import Connection
from ..models.mikrotik_server import MikrotikServer


def parse_cidr(cidr: str) -> Optional[ipaddress.IPv4Network]:
    """Parsea un CIDR IPv4. Devuelve None si no es válido o vacío."""
    if not cidr:
        return None
    try:
        net = ipaddress.ip_network(str(cidr).strip(), strict=False)
    except (ValueError, TypeError):
        return None
    if not isinstance(net, ipaddress.IPv4Network):
        return None
    return net


def parse_server_cidrs(server: MikrotikServer) -> List[ipaddress.IPv4Network]:
    """Lista de redes válidas configuradas en el server, en el orden cargado."""
    nets: List[ipaddress.IPv4Network] = []
    seen: Set[str] = set()
    for raw in server.get_pool_cidrs() if server else []:
        net = parse_cidr(raw)
        if not net:
            continue
        key = str(net)
        if key in seen:
            continue
        seen.add(key)
        nets.append(net)
    return nets


def _local_address_in_net(server: MikrotikServer, net: ipaddress.IPv4Network) -> Optional[str]:
    """Si el `local_address` del server cae en el rango, devuelve esa IP como string."""
    la = (server.local_address or "").strip()
    if not la:
        return None
    try:
        addr = ipaddress.ip_address(la)
    except ValueError:
        return None
    if isinstance(addr, ipaddress.IPv4Address) and addr in net:
        return str(addr)
    return None


def _network_reserved(net: ipaddress.IPv4Network) -> Set[str]:
    """network/broadcast (sólo si tienen sentido en este prefijo)."""
    if net.prefixlen <= 30:
        return {str(net.network_address), str(net.broadcast_address)}
    return set()


def assigned_ips(server_id: int) -> Set[str]:
    """IPs ya tomadas por conexiones de este server (cualquier estado)."""
    if not server_id:
        return set()
    rows = (
        db.session.query(Connection.ip)
        .filter(Connection.server_id == int(server_id))
        .filter(Connection.ip.isnot(None))
        .all()
    )
    out: Set[str] = set()
    for (ip_val,) in rows:
        if ip_val:
            out.add(str(ip_val).strip())
    return out


def _hosts_iter(net: ipaddress.IPv4Network) -> Iterable[ipaddress.IPv4Address]:
    """Itera hosts del rango. /31 y /32 reciben tratamiento especial."""
    if net.prefixlen == 32:
        yield net.network_address
    elif net.prefixlen == 31:
        yield net.network_address
        yield net.broadcast_address
    else:
        yield from net.hosts()


def _net_total_hosts(net: ipaddress.IPv4Network) -> int:
    if net.prefixlen == 32:
        return 1
    if net.prefixlen == 31:
        return 2
    return max(0, net.num_addresses - 2)


def _build_pool_dict(
    net: ipaddress.IPv4Network,
    *,
    used: Set[str],
    server: MikrotikServer,
    max_listed: int,
) -> dict:
    net_reserved = _network_reserved(net)
    la_reserved = _local_address_in_net(server, net)
    reserved_set = set(net_reserved)
    if la_reserved:
        reserved_set.add(la_reserved)
    blocked_in_range = reserved_set | {ip for ip in used if ipaddress.IPv4Address(ip) in net}

    available: List[str] = []
    truncated = False
    total_hosts = _net_total_hosts(net)
    used_in_range_count = 0
    reserved_in_range_count = len(reserved_set - net_reserved)  # network/broadcast no cuentan al usuario
    for addr in _hosts_iter(net):
        s = str(addr)
        if s in reserved_set:
            continue
        if s in used:
            used_in_range_count += 1
            continue
        if len(available) < max_listed:
            available.append(s)
        else:
            truncated = True

    return {
        "cidr": str(net),
        "valid": True,
        "total": total_hosts,
        "assigned": sorted(
            (ip for ip in used if ipaddress.IPv4Address(ip) in net),
            key=lambda x: int(ipaddress.IPv4Address(x)),
        ),
        "reserved": sorted(
            reserved_set - net_reserved,
            key=lambda x: int(ipaddress.IPv4Address(x)),
        ),
        "available": available,
        "next_available": available[0] if available else None,
        "truncated": truncated,
        "_used_count_in_range": used_in_range_count,
        "_reserved_count_in_range": reserved_in_range_count,
    }


def pool_summary(server: MikrotikServer, *, max_listed: int = 256) -> dict:
    """Resumen de todos los pools del server.

    `max_listed` aplica POR pool. La respuesta incluye:
      - pools[]: detalle de cada pool (cidr, total, assigned[], available[], next_available, ...).
      - cidrs[]: lista de CIDRs configurados (incluye los inválidos).
      - total / assigned_count / available_count: agregados sumando todos los pools.
      - next_available: primera IP libre del primer pool con libres.
    """
    cidrs = server.get_pool_cidrs() if server else []
    nets = parse_server_cidrs(server)
    if not nets:
        return {
            "valid": False,
            "cidrs": cidrs,
            "pools": [],
            "total": 0,
            "assigned_count": 0,
            "reserved_count": 0,
            "available_count": 0,
            "next_available": None,
        }

    used = assigned_ips(int(server.id))
    pools: List[dict] = []
    for net in nets:
        pools.append(_build_pool_dict(net, used=used, server=server, max_listed=max_listed))

    total = sum(p["total"] for p in pools)
    used_count = sum(p["_used_count_in_range"] for p in pools)
    reserved_count = sum(p["_reserved_count_in_range"] for p in pools)
    available_count = max(0, total - used_count - reserved_count)
    next_available = next((p["next_available"] for p in pools if p["next_available"]), None)

    # Limpiamos los campos internos antes de devolver.
    for p in pools:
        p.pop("_used_count_in_range", None)
        p.pop("_reserved_count_in_range", None)

    return {
        "valid": True,
        "cidrs": cidrs,
        "pools": pools,
        "total": total,
        "assigned_count": used_count,
        "reserved_count": reserved_count,
        "available_count": available_count,
        "next_available": next_available,
    }


def next_available_ip(server: MikrotikServer) -> Optional[str]:
    """Primera IP libre recorriendo los pools en orden. None si no hay/no hay pools."""
    nets = parse_server_cidrs(server)
    if not nets:
        return None
    used = assigned_ips(int(server.id))
    for net in nets:
        net_reserved = _network_reserved(net)
        la_reserved = _local_address_in_net(server, net)
        reserved = net_reserved | ({la_reserved} if la_reserved else set())
        for addr in _hosts_iter(net):
            s = str(addr)
            if s in reserved:
                continue
            if s in used:
                continue
            return s
    return None


def is_in_any_pool(server: MikrotikServer, ip: str) -> bool:
    """True si `ip` cae dentro de alguno de los CIDRs del server."""
    if not ip:
        return False
    try:
        addr = ipaddress.ip_address(str(ip).strip())
    except (ValueError, TypeError):
        return False
    return any(addr in net for net in parse_server_cidrs(server))


def is_ip_taken(server_id: int, ip: str, *, excluding_connection_id: Optional[int] = None) -> bool:
    """True si `ip` ya está asignada a otra conexión del server (excepto la indicada)."""
    if not server_id or not ip:
        return False
    q = (
        db.session.query(Connection.id)
        .filter(Connection.server_id == int(server_id))
        .filter(Connection.ip == str(ip).strip())
    )
    if excluding_connection_id is not None:
        q = q.filter(Connection.id != int(excluding_connection_id))
    return db.session.query(q.exists()).scalar()


class PoolError(ValueError):
    """Error semántico al resolver una IP del pool."""

    def __init__(self, code: str, message: str = "", **extra):
        super().__init__(message or code)
        self.code = code
        self.extra = extra


def resolve_ip_for_connection(
    *,
    server_id: Optional[int],
    requested_ip: Optional[str],
    excluding_connection_id: Optional[int] = None,
) -> tuple[Optional[str], bool]:
    """Resuelve qué IP usar para una conexión.

    - Si `requested_ip` viene con valor: la valida (formato + no tomada por otra conexión del mismo
      server) y la devuelve. NO obliga a estar dentro de los CIDRs del server (permite IPs
      fuera de los pools gestionados).
    - Si `requested_ip` viene vacío:
        - Si el server tiene al menos un pool configurado: devuelve la próxima IP libre
          recorriéndolos en orden. Si todos están llenos, lanza PoolError("pool_exhausted").
        - Si el server no tiene pools: devuelve (None, False).
    - Si `server_id` es None y no hay `requested_ip`: (None, False).

    Devuelve (ip, autoasignada).
    """
    requested = (requested_ip or "").strip() if isinstance(requested_ip, str) else (requested_ip or "")
    if requested:
        try:
            ipaddress.ip_address(requested)
        except (ValueError, TypeError):
            raise PoolError("ip_invalid", value=requested)
        if server_id and is_ip_taken(int(server_id), requested, excluding_connection_id=excluding_connection_id):
            raise PoolError("ip_already_taken", value=requested, server_id=int(server_id))
        return requested, False

    if not server_id:
        return None, False
    server = MikrotikServer.query.get(int(server_id))
    if not server or not parse_server_cidrs(server):
        return None, False
    nxt = next_available_ip(server)
    if not nxt:
        raise PoolError(
            "pool_exhausted",
            server_id=int(server_id),
            cidrs=server.get_pool_cidrs(),
        )
    return nxt, True
