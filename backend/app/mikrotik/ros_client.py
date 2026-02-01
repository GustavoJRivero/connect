from typing import Optional

from routeros_api import RouterOsApiPool


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
            # routeros-api usa `.id` para borrar
            res.remove(id=item[".id"])

    def set_pppoe_secret_profile(self, *, name: str, profile: str) -> None:
        if not self._api:
            raise RuntimeError("Not connected")
        res = self._api.get_resource("/ppp/secret")
        items = res.get(name=name)
        for item in items:
            res.set(id=item[".id"], profile=profile)

    def set_pppoe_secret_remote_address(self, *, name: str, remote_address: str) -> None:
        """
        Setea remote-address en el secret. Si remote_address es vacío, lo limpia (pool dinámico).
        """
        if not self._api:
            raise RuntimeError("Not connected")
        res = self._api.get_resource("/ppp/secret")
        items = res.get(name=name)
        for item in items:
            res.set(id=item[".id"], **{"remote-address": remote_address})

    def get_pppoe_active(self, *, name: str):
        if not self._api:
            raise RuntimeError("Not connected")
        res = self._api.get_resource("/ppp/active")
        items = res.get(name=name)
        return items[0] if items else None

    def get_pppoe_secret(self, *, name: str):
        if not self._api:
            raise RuntimeError("Not connected")
        res = self._api.get_resource("/ppp/secret")
        items = res.get(name=name)
        return items[0] if items else None

