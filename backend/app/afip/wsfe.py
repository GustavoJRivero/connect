"""
Integración AFIP WSFE (Factura electrónica).

Lo dejamos como “stub” por ahora; en la próxima iteración definimos:
- datos del emisor (pto vta, condición IVA, etc.)
- tipos de comprobante a emitir
- flujo CAE (Auth -> FECAESolicitar)

Sugerencia de implementación: `pyafipws` (WSAA + WSFE).
"""


class AfipWsfeClient:
    def __init__(self, *, env: str, cuit: str, cert_path: str, key_path: str):
        self.env = env
        self.cuit = cuit
        self.cert_path = cert_path
        self.key_path = key_path

    def ping(self) -> dict:
        # TODO: implementar llamado real a WSFE/WSAA
        return {"env": self.env, "status": "not_implemented"}

