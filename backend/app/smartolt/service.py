"""Lógica de administración de la ONU del cliente sobre la API de SmartOLT."""
from __future__ import annotations

import re
import threading
import time
from typing import Any, Callable, Optional

from ..extensions import db
from ..models.connection import Connection
from .client import SmartOltClient, SmartOltError

STATUS_TTL = 90
SIGNAL_TTL = 120
DETAILS_TTL = 300
HOSTS_TTL = 60
REBOOT_STATUS_TTL = 20
REBOOT_MIN_SECONDS = 90
REBOOT_MAX_SECONDS = 600

WIFI_PORT_A = "wifi_0/1"
WIFI_PORT_B = "wifi_0/5"

_cache: dict[tuple, tuple[float, Any]] = {}
_cache_lock = threading.Lock()
_hosts_lock = threading.Lock()
_cooldown_until = 0.0
_reboots: dict[str, dict] = {}


class OnuUnavailable(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _cache_get(key: tuple) -> Any:
    with _cache_lock:
        hit = _cache.get(key)
        if hit and hit[0] > time.monotonic():
            return hit[1]
        _cache.pop(key, None)
    return None


def _cache_set(key: tuple, value: Any, ttl: int) -> None:
    with _cache_lock:
        if len(_cache) > 5000:
            now = time.monotonic()
            for k in [k for k, (exp, _) in _cache.items() if exp <= now]:
                _cache.pop(k, None)
        _cache[key] = (time.monotonic() + ttl, value)


def invalidate(*keys: tuple) -> None:
    with _cache_lock:
        for k in keys:
            _cache.pop(k, None)


def _call(fn: Callable[[], Any]) -> Any:
    """Corta las llamadas mientras SmartOLT nos tenga limitados (429 de cuenta)."""
    global _cooldown_until
    if time.monotonic() < _cooldown_until:
        raise SmartOltError("rate_limit_exceeded", "Límite de consultas a SmartOLT", status=429)
    try:
        return fn()
    except SmartOltError as e:
        if e.status == 429 and e.code != "already_a_request_in_progress":
            _cooldown_until = time.monotonic() + max(30, min(int(e.retry_after or 60), 3600))
        raise


def _cached(key: tuple, ttl: int, fn: Callable[[], Any]) -> Any:
    hit = _cache_get(key)
    if hit is not None:
        return hit
    value = _call(fn)
    _cache_set(key, value, ttl)
    return value


# ----------------------------------------------------------------------
# Identificación de la ONU
# ----------------------------------------------------------------------
def normalize_sn(raw: Optional[str]) -> str:
    sn = re.sub(r"[^0-9A-Za-z]", "", raw or "").upper()
    # SN en formato hexadecimal (p. ej. 48575443XXXXXXXX → HWTCXXXXXXXX)
    if len(sn) == 16 and re.fullmatch(r"[0-9A-F]{16}", sn):
        try:
            vendor = bytes.fromhex(sn[:8]).decode("ascii")
            if re.fullmatch(r"[A-Z]{4}", vendor):
                return vendor + sn[8:]
        except (ValueError, UnicodeDecodeError):
            pass
    return sn


def detect_vendor(onu_type_name: Optional[str], sn: Optional[str]) -> Optional[str]:
    t = (onu_type_name or "").upper()
    s = (sn or "").upper()
    if "VSOL" in t or "V-SOL" in t or re.match(r"^V\d{4}", t) or s.startswith("VSOL"):
        return "VSOL"
    if "HUAWEI" in t or re.match(r"^(HG|EG|HS|EH)8", t) or s.startswith("HWTC"):
        return "HUAWEI"
    if "ZTE" in t or re.match(r"^F\d{3}", t) or s.startswith("ZTE"):
        return "ZTE"
    return None


def band_ports(vendor: Optional[str]) -> dict[str, str]:
    """Banda → puerto WiFi. VSOL tiene los puertos invertidos respecto de ZTE/Huawei."""
    if vendor == "VSOL":
        return {"2.4": WIFI_PORT_B, "5": WIFI_PORT_A}
    return {"2.4": WIFI_PORT_A, "5": WIFI_PORT_B}


def _details(sn: str) -> list[dict]:
    return _cached(("details", sn), DETAILS_TTL, lambda: SmartOltClient().onus_details_by_sn(sn))


def _pick_onu(onus: list[dict], sn: str, external_id: Optional[str] = None) -> Optional[dict]:
    for o in onus:
        if external_id and str(o.get("unique_external_id") or "") == external_id:
            return o
    for o in onus:
        if normalize_sn(o.get("sn")) == sn:
            return o
    return onus[0] if len(onus) == 1 else None


def resolve_onu(conn: Connection) -> dict:
    """Devuelve {external_id, sn, type_name, vendor}; cachea el external_id en la conexión."""
    sn = normalize_sn(conn.pon_sn)
    if not sn:
        raise OnuUnavailable("onu_not_assigned", "Esta conexión no tiene un equipo asociado.")
    external_id = (conn.onu_external_id or "").strip()
    type_name = conn.onu_type_name
    if not external_id:
        try:
            onus = _details(sn)
        except SmartOltError as e:
            if e.code in ("specify_valid_field", "http_404", "onu_not_found"):
                raise OnuUnavailable("onu_not_found", "No encontramos tu equipo en el sistema.")
            raise
        onu = _pick_onu(onus, sn)
        if not onu or not str(onu.get("unique_external_id") or "").strip():
            raise OnuUnavailable("onu_not_found", "No encontramos tu equipo en el sistema.")
        external_id = str(onu["unique_external_id"]).strip()
        type_name = str(onu.get("onu_type_name") or "").strip() or None
        conn.onu_external_id = external_id[:64]
        conn.onu_type_name = (type_name or "")[:120] or None
        db.session.commit()
    return {
        "external_id": external_id,
        "sn": sn,
        "type_name": type_name,
        "vendor": detect_vendor(type_name, sn),
    }


# ----------------------------------------------------------------------
# Estado y señal
# ----------------------------------------------------------------------
def parse_dbm(raw: Any) -> Optional[float]:
    m = re.search(r"-?\d+(?:[.,]\d+)?", str(raw or ""))
    if not m:
        return None
    try:
        return float(m.group(0).replace(",", "."))
    except ValueError:
        return None


def classify_signal(rx: Optional[float]) -> dict:
    if rx is None:
        return {"level": "unknown", "message": "Sin lectura de señal"}
    if rx < -27:
        return {"level": "red", "message": "Problemas en fibra óptica"}
    if rx <= -25:
        return {"level": "yellow", "message": "Se recomienda llamar a servicio técnico"}
    return {"level": "green", "message": "Todo ok"}


def classify_status(raw: Optional[str]) -> dict:
    s = (raw or "").strip().lower()
    if s == "online":
        return {"state": "ONLINE", "level": "green", "label": "En línea", "message": "Tu equipo está funcionando"}
    if s in ("power fail", "powerfail", "power_fail", "dying gasp"):
        return {"state": "POWER_FAIL", "level": "red", "label": "Sin energía", "message": "Posible corte de luz"}
    if s == "los":
        return {"state": "LOS", "level": "red", "label": "Sin señal", "message": "Posible corte de fibra"}
    if s == "offline":
        return {"state": "OFFLINE", "level": "red", "label": "Desconectado", "message": "Posible corte de fibra"}
    return {"state": "UNKNOWN", "level": "unknown", "label": raw or "Desconocido", "message": "No pudimos leer el estado"}


def onu_status(onu: dict, ttl: int = STATUS_TTL) -> dict:
    ext = onu["external_id"]
    body = _cached(("status", ext), ttl, lambda: SmartOltClient().onu_status(ext))
    out = classify_status(body.get("onu_status"))
    out["last_change"] = body.get("last_status_change")
    return out


def onu_signal(onu: dict) -> dict:
    ext = onu["external_id"]
    body = _cached(("signal", ext), SIGNAL_TTL, lambda: SmartOltClient().onu_signal(ext))
    rx = parse_dbm(body.get("onu_signal_1490"))
    out = classify_signal(rx)
    out["rx_dbm"] = rx
    out["tx_dbm"] = parse_dbm(body.get("onu_signal_1310"))
    return out


# ----------------------------------------------------------------------
# WiFi
# ----------------------------------------------------------------------
def wifi_networks(onu: dict) -> list[dict]:
    onus = _details(onu["sn"])
    data = _pick_onu(onus, onu["sn"], onu["external_id"]) or {}
    ports = {str(p.get("port") or ""): p for p in (data.get("wifi_ports") or []) if isinstance(p, dict)}
    out = []
    for band, port in band_ports(onu["vendor"]).items():
        p = ports.get(port)
        if p is None:
            continue
        admin = str(p.get("admin_state") or "").strip().lower()
        out.append({
            "band": band,
            "ssid": p.get("ssid") or p.get("reported_ssid") or "",
            "password": p.get("password") or "",
            "enabled": admin not in ("disabled", "down", "off"),
        })
    return out


def set_wifi(onu: dict, band: str, ssid: str, password: str) -> None:
    port = band_ports(onu["vendor"]).get(band)
    if not port:
        raise ValueError("invalid_band")
    _call(lambda: SmartOltClient().set_wifi_port_lan(onu["external_id"], port, ssid, password))
    invalidate(("details", onu["sn"]), ("hosts", onu["external_id"]))


def reboot(onu: dict) -> None:
    _call(lambda: SmartOltClient().reboot(onu["external_id"]))
    mark_rebooting(onu["external_id"], time.time())
    invalidate(("status", onu["external_id"]), ("signal", onu["external_id"]), ("hosts", onu["external_id"]))


def mark_rebooting(external_id: str, started_at: float) -> None:
    if time.time() - started_at < REBOOT_MAX_SECONDS:
        _reboots.setdefault(external_id, {"at": started_at, "seen_down": False})


def is_rebooting(external_id: str) -> bool:
    r = _reboots.get(external_id)
    if r and time.time() - r["at"] >= REBOOT_MAX_SECONDS:
        _reboots.pop(external_id, None)
        return False
    return r is not None


def reboot_progress(external_id: str, status_state: str) -> bool:
    """Sigue en reinicio hasta verla caer y volver, o estar Online pasado el mínimo."""
    if not is_rebooting(external_id):
        return False
    r = _reboots[external_id]
    if status_state != "ONLINE":
        r["seen_down"] = True
        return True
    if r["seen_down"] or time.time() - r["at"] >= REBOOT_MIN_SECONDS:
        _reboots.pop(external_id, None)
        return False
    return True


# ----------------------------------------------------------------------
# Equipos conectados
# ----------------------------------------------------------------------
def _truthy(v: Any) -> bool:
    return str(v).strip().lower() in ("1", "true", "yes", "on")


def _host_to_dict(h: dict, vendor: Optional[str]) -> dict:
    iface_type = str(h.get("InterfaceType") or "").strip().lower()
    layer2 = str(h.get("Layer2Interface") or "")
    m = re.search(r"(?:WLANConfiguration|SSID)\.(\d+)", layer2, re.IGNORECASE)
    is_wifi = bool(m) or "802.11" in iface_type or "wifi" in iface_type or "wlan" in layer2.lower()
    band = None
    if m:
        port = f"wifi_0/{m.group(1)}"
        band = next((b for b, p in band_ports(vendor).items() if p == port), None)
    signal = h.get("wifi_signal_dbm")
    try:
        signal = int(float(signal)) if signal not in (None, "") else None
    except (TypeError, ValueError):
        signal = None
    return {
        "name": str(h.get("HostName") or "").strip() or None,
        "ip": str(h.get("IPAddress") or "").strip() or None,
        "mac": str(h.get("MACAddress") or "").strip().upper() or None,
        "connection": "WIFI" if is_wifi else "CABLE",
        "band": band,
        "signal_dbm": signal if is_wifi else None,
    }


def router_hosts(onu: dict) -> list[dict]:
    ext = onu["external_id"]
    hit = _cache_get(("hosts", ext))
    if hit is not None:
        return hit
    if not _hosts_lock.acquire(blocking=False):
        raise SmartOltError("already_a_request_in_progress", "Consulta en curso", status=429)
    try:
        raw = _call(lambda: SmartOltClient().onu_router_hosts(ext))
    finally:
        _hosts_lock.release()
    hosts = [_host_to_dict(h, onu["vendor"]) for h in raw if "Active" not in h or _truthy(h.get("Active"))]
    hosts.sort(key=lambda x: (x["connection"] != "WIFI", (x["name"] or "~").lower()))
    _cache_set(("hosts", ext), hosts, HOSTS_TTL)
    return hosts
