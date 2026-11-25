"""
Cliente HTTP para la API de SmartOLT (https://{subdominio}.smartolt.com/api).

Autenticación con header `X-Token`. Todas las respuestas traen `status`;
cuando es false vienen `error` y `error_code`.

Límites de la cuenta: 1000 llamadas/hora y 15/segundo (429 + Retry-After).
`get_onu_router_hosts` admite una sola consulta en curso por cuenta
(429 con error_code=already_a_request_in_progress).
"""
from typing import Optional

import requests

from .config import smartolt_api_key, smartolt_base_url

DEFAULT_TIMEOUT = 30
HOSTS_TIMEOUT = 60


class SmartOltError(Exception):
    def __init__(self, code: str, message: str = "", status: Optional[int] = None, retry_after: Optional[int] = None):
        super().__init__(message or code)
        self.code = code
        self.message = message or code
        self.status = status
        self.retry_after = retry_after


class SmartOltNotConfigured(SmartOltError):
    def __init__(self):
        super().__init__("smartolt_not_configured", "SMARTOLT_BASE_URL / SMARTOLT_API_KEY no configurados")


class SmartOltClient:
    def __init__(self, base_url: Optional[str] = None, api_key: Optional[str] = None):
        self.base_url = (base_url or smartolt_base_url()).strip().rstrip("/")
        self.api_key = (api_key or smartolt_api_key()).strip()
        if not self.base_url or not self.api_key:
            raise SmartOltNotConfigured()
        if not self.base_url.endswith("/api"):
            self.base_url = f"{self.base_url}/api"

    def _headers(self) -> dict:
        return {"X-Token": self.api_key, "Accept": "application/json"}

    def _handle(self, r: requests.Response) -> dict:
        try:
            body = r.json()
        except ValueError:
            body = {}
        if not isinstance(body, dict):
            body = {"response": body}
        if r.status_code == 429:
            try:
                retry_after = int(r.headers.get("Retry-After") or 0) or None
            except ValueError:
                retry_after = None
            code = str(body.get("error_code") or body.get("response_code") or "rate_limit_exceeded")
            raise SmartOltError(code, str(body.get("error") or "Demasiadas consultas"), status=429, retry_after=retry_after)
        if r.status_code >= 400 or body.get("status") is False:
            code = str(body.get("error_code") or f"http_{r.status_code}").lower()
            msg = str(body.get("error") or r.text or "")[:300]
            raise SmartOltError(code, msg, status=r.status_code)
        return body

    def _get(self, path: str, timeout: int = DEFAULT_TIMEOUT) -> dict:
        try:
            r = requests.get(f"{self.base_url}{path}", headers=self._headers(), timeout=timeout)
        except requests.RequestException as e:
            raise SmartOltError("smartolt_unreachable", str(e))
        return self._handle(r)

    def _post(self, path: str, data: Optional[dict] = None) -> dict:
        try:
            r = requests.post(f"{self.base_url}{path}", data=data or {}, headers=self._headers(), timeout=DEFAULT_TIMEOUT)
        except requests.RequestException as e:
            raise SmartOltError("smartolt_unreachable", str(e))
        return self._handle(r)

    @staticmethod
    def _seg(value: str) -> str:
        return requests.utils.quote(str(value).strip(), safe="")

    def onus_details_by_sn(self, sn: str) -> list[dict]:
        body = self._get(f"/onu/get_onus_details_by_sn/{self._seg(sn)}")
        onus = body.get("onus") or []
        return [o for o in onus if isinstance(o, dict)]

    def onu_status(self, external_id: str) -> dict:
        return self._get(f"/onu/get_onu_status/{self._seg(external_id)}")

    def onu_signal(self, external_id: str) -> dict:
        return self._get(f"/onu/get_onu_signal/{self._seg(external_id)}")

    def onu_router_hosts(self, external_id: str) -> list[dict]:
        body = self._get(f"/onu/get_onu_router_hosts/{self._seg(external_id)}", timeout=HOSTS_TIMEOUT)
        resp = body.get("response")
        hosts = (resp.get("hostlist") if isinstance(resp, dict) else None) or body.get("hosts") or []
        if isinstance(hosts, dict):
            hosts = list(hosts.values())
        return [h for h in hosts if isinstance(h, dict)]

    def set_wifi_port_lan(self, external_id: str, wifi_port: str, ssid: str, password: str) -> dict:
        return self._post(
            f"/onu/set_wifi_port_lan/{self._seg(external_id)}",
            {
                "wifi_port": wifi_port,
                "ssid": ssid,
                "password": password,
                "authentication_mode": "WPA2",
            },
        )

    def reboot(self, external_id: str) -> dict:
        return self._post(f"/onu/reboot/{self._seg(external_id)}")
