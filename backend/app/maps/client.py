"""
Cliente HTTP para la Connect Maps API (maps.connectsrl.ar).

Spec: https://maps.connectsrl.ar/doc/openapi.json (v1.2.0)

Autenticación por API key en header `X-API-Key`:
  - Read  (cmk_read_…):  consultas (disponibilidad, cálculo, leer NAP)
  - Write (cmk_write_…): además escrituras al infoTable (reserva/liberación)

Endpoints usados:
  GET  /api/v1/a?lat=&lng=  (o ?url=)   → disponibilidad (NAPs en radio)
  GET  /api/v1/i?lat=&lng=  (o ?url=)   → cálculo de instalación (ruta + fibra)
  GET  /api/v1/{featureRef}             → leer un elemento (NAP) con su infoTable
  POST /api/v1/{featureRef}             → actualizar infoTable (Read/Write)

La reserva de puerto NO es un endpoint atómico: es leer los contadores del
infoTable del NAP, ajustarlos y escribirlos (read-modify-write). Los nombres
de columnas son configurables por settings (default: Reservados/Disponibles).

NOTA: los parsers de respuesta son defensivos porque el spec declara los 200
como objeto genérico. Cuando tengamos la API key y veamos las respuestas
reales, ajustar `parse_availability` / `parse_install_calc` si hace falta.
"""
import json
from typing import Optional

import requests

from .config import maps_api_base_url, maps_api_key


DEFAULT_TIMEOUT = 45


class MapsError(Exception):
    """Error de la API de mapas."""

    def __init__(self, code: str, message: str = "", status: Optional[int] = None):
        super().__init__(message or code)
        self.code = code
        self.message = message or code
        self.status = status


class MapsNotConfigured(MapsError):
    def __init__(self):
        super().__init__("maps_not_configured", "MAPS_API_BASE_URL / MAPS_API_KEY no configurados")


def _setting(key: str, default: str = "") -> str:
    from ..models.setting import Setting

    s = Setting.query.get(key)
    return (s.value if s and s.value is not None else default) or default


def get_nap_columns() -> tuple[str, str]:
    """Nombres de columnas del infoTable del NAP para reservados/disponibles."""
    reserved = _setting("maps.nap.reserved_column", "Reservados")
    available = _setting("maps.nap.available_column", "Disponibles")
    return reserved, available


class MapsClient:
    def __init__(self, base_url: Optional[str] = None, api_key: Optional[str] = None):
        self.base_url = (base_url or maps_api_base_url()).strip().rstrip("/")
        self.api_key = (api_key or maps_api_key()).strip()
        if not self.base_url or not self.api_key:
            raise MapsNotConfigured()

    # ------------------------------------------------------------------
    # HTTP base
    # ------------------------------------------------------------------
    def _headers(self) -> dict:
        return {"X-API-Key": self.api_key, "Accept": "application/json"}

    def _handle(self, r: requests.Response) -> dict:
        try:
            body = r.json()
        except ValueError:
            body = {}
        if r.status_code >= 400:
            code = str(body.get("code") or f"http_{r.status_code}").lower()
            msg = str(body.get("error") or r.text or "")[:300]
            raise MapsError(code, msg, status=r.status_code)
        return body if isinstance(body, dict) else {"data": body}

    def _get(self, path: str, params: Optional[dict] = None) -> dict:
        try:
            r = requests.get(
                f"{self.base_url}{path}", params=params or {},
                headers=self._headers(), timeout=DEFAULT_TIMEOUT,
            )
        except requests.RequestException as e:
            raise MapsError("maps_unreachable", str(e))
        return self._handle(r)

    def _post(self, path: str, payload: dict) -> dict:
        try:
            r = requests.post(
                f"{self.base_url}{path}", json=payload,
                headers=self._headers(), timeout=DEFAULT_TIMEOUT,
            )
        except requests.RequestException as e:
            raise MapsError("maps_unreachable", str(e))
        return self._handle(r)

    @staticmethod
    def _loc_params(lat=None, lng=None, url: Optional[str] = None) -> dict:
        if url:
            return {"url": str(url).strip()}
        if lat is not None and lng is not None:
            return {"lat": str(lat), "lng": str(lng)}
        raise MapsError("location_required", "Falta lat/lng o url")

    # ------------------------------------------------------------------
    # Endpoints
    # ------------------------------------------------------------------
    def check_availability(self, lat=None, lng=None, url: Optional[str] = None, view: str = "compact") -> dict:
        params = self._loc_params(lat, lng, url)
        params["view"] = view
        return self._get("/api/v1/a", params)

    def calculate_install(self, lat=None, lng=None, url: Optional[str] = None, view: str = "full") -> dict:
        params = self._loc_params(lat, lng, url)
        params["view"] = view
        return self._get("/api/v1/i", params)

    def get_feature(self, feature_ref: str, view: str = "compact") -> dict:
        return self._get(f"/api/v1/{feature_ref}", {"view": view})

    def update_info_table(self, feature_ref: str, values: dict) -> dict:
        return self._post(f"/api/v1/{feature_ref}", {"infoTable": {k: str(v) for k, v in values.items()}})

    # ------------------------------------------------------------------
    # Reserva / liberación de puerto (read-modify-write del infoTable)
    # ------------------------------------------------------------------
    def _read_counters(self, feature_ref: str) -> tuple[dict, int, int]:
        reserved_col, available_col = get_nap_columns()
        feature = self.get_feature(feature_ref)
        info = feature.get("infoTable") or {}
        if not isinstance(info, dict):
            info = {}

        def _int_of(col: str, default: int = 0) -> int:
            # match case-insensitive por nombre de columna
            for k, v in info.items():
                if str(k).strip().lower() == col.strip().lower():
                    try:
                        return int(str(v).strip() or 0)
                    except ValueError:
                        return default
            return default

        return feature, _int_of(reserved_col), _int_of(available_col)

    def reserve_port(self, feature_ref: str) -> dict:
        """Reservados +1 / Disponibles −1. Falla si no hay disponibles."""
        reserved_col, available_col = get_nap_columns()
        _, reserved, available = self._read_counters(feature_ref)
        if available <= 0:
            raise MapsError("nap_sin_disponibles", f"El NAP {feature_ref} no tiene puertos disponibles")
        return self.update_info_table(
            feature_ref,
            {reserved_col: reserved + 1, available_col: available - 1},
        )

    def release_port(self, feature_ref: str) -> dict:
        """Reservados −1 / Disponibles +1 (no baja de cero)."""
        reserved_col, available_col = get_nap_columns()
        _, reserved, available = self._read_counters(feature_ref)
        return self.update_info_table(
            feature_ref,
            {reserved_col: max(0, reserved - 1), available_col: available + 1},
        )


# ----------------------------------------------------------------------
# Parsers defensivos (ajustar cuando veamos respuestas reales con la key)
# ----------------------------------------------------------------------
def _first_key(d: dict, keys: list[str]):
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
    return None


def parse_availability(body: dict) -> dict:
    """Normaliza la respuesta de /a → {available: bool, naps: [{ref, name, distance}]}.

    Formato real (v1.2.0): {"available": bool, "candidates": [{"id", "name",
    "distanceMeters", "fieldValue", "isAvailable"}], ...} ordenado por cercanía.
    """
    naps_raw = _first_key(body, ["candidates", "naps", "features", "items", "results", "elements", "matches"]) or []
    if not isinstance(naps_raw, list):
        naps_raw = []

    naps = []
    for item in naps_raw:
        if not isinstance(item, dict):
            continue
        # Solo candidatos con capacidad (isAvailable=False se descarta).
        if item.get("isAvailable") is False:
            continue
        ref = _first_key(item, ["id", "featureId", "ref", "feature_ref"])
        name = _first_key(item, ["name", "nombre", "label", "title"])
        distance = _first_key(item, ["distanceMeters", "distance", "distance_m", "meters", "metros"])
        naps.append({"ref": (str(ref) if ref is not None else None), "name": (str(name) if name is not None else None), "distance": distance})

    available = _first_key(body, ["available", "hasCoverage", "covered", "ok", "disponible"])
    if available is None:
        available = len(naps) > 0
    return {"available": bool(available), "naps": naps, "raw": body}


def parse_install_calc(body: dict) -> dict:
    """Normaliza la respuesta de /i → {fiber_meters, nap_ref, nap_name}."""
    fiber = _first_key(
        body,
        [
            "fiberMeters", "fiber_meters", "recommendedFiberMeters", "recommended_fiber_meters",
            "fibraMetros", "fibra_recomendada", "fiber", "totalMeters", "total_meters", "meters",
        ],
    )
    nap = _first_key(body, ["nap", "nearestNap", "nearest_nap", "feature", "target", "destination"])
    nap_ref = None
    nap_name = None
    if isinstance(nap, dict):
        nap_ref = _first_key(nap, ["id", "featureId", "ref"])
        nap_name = _first_key(nap, ["name", "nombre", "label"])
    elif nap is not None:
        nap_name = str(nap)

    if fiber is not None:
        try:
            fiber = float(str(fiber).replace(",", "."))
        except ValueError:
            fiber = None

    return {
        "fiber_meters": fiber,
        "nap_ref": (str(nap_ref) if nap_ref is not None else None),
        "nap_name": (str(nap_name) if nap_name is not None else None),
        "raw": body,
    }


def dumps_compact(obj) -> str:
    """JSON compacto para persistir snapshots."""
    try:
        return json.dumps(obj, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        return "{}"
