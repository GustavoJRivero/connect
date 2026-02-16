from typing import Any, Dict, Optional

from routeros_api import RouterOsApiPool


def _item_id(item: Dict[str, Any]) -> str:
    """RouterOS devuelve el identificador como '.id' o a veces 'id'."""
    return item.get(".id") or item.get("id") or ""


class MikrotikRosClient:
    def __init__(self, *, host: str, user: str, password: str, port: int = 8728, use_ssl: bool = False):
        self.host = host
        self.user = user
        self.password = password
        self.port = port
        self.use_ssl = use_ssl

        self._pool = None
        self._api = None

    def connect(self):
        self._pool = RouterOsApiPool(
            self.host,
            username=self.user,
            password=self.password,
            port=self.port,
            use_ssl=self.use_ssl,
            plaintext_login=True,
        )
        self._api = self._pool.get_api()
        return self

    def close(self):
        if self._pool:
            self._pool.disconnect()
            self._pool = None
            self._api = None

    def list_pppoe_secrets(self):
        if not self._api:
            raise RuntimeError("Not connected")
        return self._api.get_resource("/ppp/secret").get()

    def add_pppoe_secret(
        self,
        *,
        name: str,
        password: str,
        profile: str,
        service: str = "pppoe",
        remote_address: Optional[str] = None,
    ) -> dict:
        if not self._api:
            raise RuntimeError("Not connected")
        res = self._api.get_resource("/ppp/secret")
        kwargs = {}
        if remote_address is not None:
            kwargs["remote-address"] = remote_address
        return res.add(name=name, password=password, profile=profile, service=service, **kwargs)

    def remove_pppoe_secret(self, *, name: str) -> None:
        if not self._api:
            raise RuntimeError("Not connected")
        res = self._api.get_resource("/ppp/secret")
        items = res.get(name=name)
        for item in items:
            rid = _item_id(item)
            if rid:
                res.remove(**{".id": rid})

    def set_pppoe_secret_profile(self, *, name: str, profile: str) -> None:
        if not self._api:
            raise RuntimeError("Not connected")
        if not profile:
            raise ValueError("profile no puede estar vacío")
        res = self._api.get_resource("/ppp/secret")
        items = res.get(name=name)
        for item in items:
            rid = _item_id(item)
            if rid:
                res.set(**{".id": rid, "profile": profile})

    def set_pppoe_secret_remote_address(self, *, name: str, remote_address: str) -> None:
        """
        Setea remote-address en el secret. Si remote_address es vacío, lo limpia (pool dinámico).
        Usamos .id como clave para evitar "Malformed sentence" con routeros_api.
        """
        if not self._api:
            raise RuntimeError("Not connected")
        res = self._api.get_resource("/ppp/secret")
        items = res.get(name=name)
        for item in items:
            rid = _item_id(item)
            if rid:
                res.set(**{".id": rid, "remote-address": remote_address})

    def set_pppoe_secret_credentials(self, *, old_name: str, new_name: str, new_password: str) -> None:
        """
        Actualiza name/password del secret. Si el secret no se encuentra por old_name, intenta por new_name.
        """
        if not self._api:
            raise RuntimeError("Not connected")
        res = self._api.get_resource("/ppp/secret")
        items = res.get(name=old_name)
        if not items and new_name and new_name != old_name:
            items = res.get(name=new_name)
        if not items:
            raise RuntimeError("pppoe_secret_not_found")
        for item in items:
            rid = _item_id(item)
            if rid:
                res.set(**{".id": rid, "name": new_name, "password": new_password})

    def get_pppoe_active(self, *, name: str):
        if not self._api:
            raise RuntimeError("Not connected")
        res = self._api.get_resource("/ppp/active")
        items = res.get(name=name)
        return items[0] if items else None

    def disconnect_pppoe_session(self, *, name: str) -> bool:
        """
        Desconecta la sesión PPPoE activa para el usuario dado.
        Así, al reconectar, el cliente toma el perfil actual del secret (ej. suspended).
        Retorna True si se desconectó una sesión, False si no había sesión activa.
        """
        if not self._api:
            raise RuntimeError("Not connected")
        res = self._api.get_resource("/ppp/active")
        items = res.get(name=name)
        disconnected = False
        for item in items or []:
            rid = _item_id(item)
            if rid:
                res.remove(**{".id": rid})
                disconnected = True
        return disconnected

    def get_pppoe_secret(self, *, name: str):
        if not self._api:
            raise RuntimeError("Not connected")
        res = self._api.get_resource("/ppp/secret")
        items = res.get(name=name)
        return items[0] if items else None

