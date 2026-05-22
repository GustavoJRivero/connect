from __future__ import annotations

"""
Integracion AFIP WSAA + WSFEv1 sin dependencias externas de AFIP.

- Firma LoginTicketRequest con certificado + clave privada (CMS PKCS#7 detached)
- Llama a WSAA LoginCms para obtener Token/Sign
- Llama a WSFEv1 para FECompUltimoAutorizado y FECAESolicitar
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
import base64
import html
import os
from typing import Any
from xml.etree import ElementTree as ET

import requests
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.serialization import pkcs7


SOAP_ENV_NS = "http://schemas.xmlsoap.org/soap/envelope/"


class AfipIntegrationError(RuntimeError):
    """Error controlado de integracion AFIP."""


@dataclass
class AfipIssuedInvoice:
    cbte_number: int
    cae: str
    cae_due_date: date
    result: str
    obs: list[dict[str, str]]


class AfipWsfeClient:
    def __init__(self, *, env: str, cuit: str, cert_path: str, key_path: str):
        self.env = (env or "HOMOLOGACION").strip().upper()
        self.cuit = str(cuit or "").strip()
        self.cert_path = str(cert_path or "").strip()
        self.key_path = str(key_path or "").strip()

    def _require_config(self) -> None:
        if not self.cuit:
            raise AfipIntegrationError("afip_cuit_required")
        if not self.cert_path:
            raise AfipIntegrationError("afip_cert_path_required")
        if not self.key_path:
            raise AfipIntegrationError("afip_key_path_required")
        if not os.path.exists(self.cert_path):
            raise AfipIntegrationError(f"afip_cert_not_found:{self.cert_path}")
        if not os.path.exists(self.key_path):
            raise AfipIntegrationError(f"afip_key_not_found:{self.key_path}")

    def _service_urls(self) -> tuple[str, str]:
        if self.env == "PRODUCCION":
            return (
                "https://wsaa.afip.gov.ar/ws/services/LoginCms",
                "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
            )
        return (
            "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
            "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
        )

    @staticmethod
    def _local_name(tag: str) -> str:
        return tag.split("}", 1)[-1] if "}" in tag else tag

    @staticmethod
    def _first_text(root: ET.Element, local_name: str) -> str:
        for e in root.iter():
            if AfipWsfeClient._local_name(e.tag) == local_name:
                return (e.text or "").strip()
        return ""

    @staticmethod
    def _fmt_date(d: date) -> str:
        return d.strftime("%Y%m%d")

    @staticmethod
    def _to_2(v: Decimal) -> Decimal:
        return v.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    @staticmethod
    def _parse_afip_date(v: str | None) -> date:
        raw = str(v or "").strip()
        if len(raw) == 8:
            return date(int(raw[0:4]), int(raw[4:6]), int(raw[6:8]))
        raise AfipIntegrationError(f"afip_invalid_date:{raw}")

    def _load_cert_and_key(self):
        cert_bytes = open(self.cert_path, "rb").read()
        key_bytes = open(self.key_path, "rb").read()

        cert = None
        for loader in (x509.load_pem_x509_certificate, x509.load_der_x509_certificate):
            try:
                cert = loader(cert_bytes)
                break
            except Exception:
                continue
        if cert is None:
            raise AfipIntegrationError("afip_invalid_cert_file")

        key = None
        for loader in (serialization.load_pem_private_key, serialization.load_der_private_key):
            try:
                key = loader(key_bytes, password=None)
                break
            except Exception:
                continue
        if key is None:
            raise AfipIntegrationError("afip_invalid_key_file_or_password_protected")

        return cert, key

    def _build_tra(self) -> bytes:
        now = datetime.now(timezone.utc)
        generation = (now - timedelta(minutes=10)).isoformat()
        expiration = (now + timedelta(hours=12)).isoformat()
        unique_id = int(now.timestamp())
        xml = f"""<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<loginTicketRequest version=\"1.0\">
  <header>
    <uniqueId>{unique_id}</uniqueId>
    <generationTime>{generation}</generationTime>
    <expirationTime>{expiration}</expirationTime>
  </header>
  <service>wsfe</service>
</loginTicketRequest>
"""
        return xml.encode("utf-8")

    def _wsaa_token_sign(self) -> tuple[str, str]:
        cert, key = self._load_cert_and_key()
        tra = self._build_tra()
        cms_der = pkcs7.PKCS7SignatureBuilder().set_data(tra).add_signer(
            cert, key, hashes.SHA256()
        ).sign(
            serialization.Encoding.DER,
            [pkcs7.PKCS7Options.DetachedSignature],
        )
        cms_b64 = base64.b64encode(cms_der).decode("ascii")

        wsaa_url, _ = self._service_urls()
        envelope = f"""<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<soapenv:Envelope xmlns:soapenv=\"{SOAP_ENV_NS}\" xmlns:wsaa=\"http://wsaa.view.sua.dvadac.desein.afip.gov\">
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>{cms_b64}</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>"""

        try:
            r = requests.post(
                wsaa_url,
                data=envelope.encode("utf-8"),
                headers={"Content-Type": "text/xml; charset=utf-8"},
                timeout=30,
            )
            r.raise_for_status()
        except Exception as e:
            raise AfipIntegrationError(f"wsaa_http_error:{e}") from e

        try:
            root = ET.fromstring(r.text)
        except Exception as e:
            raise AfipIntegrationError(f"wsaa_xml_parse_error:{e}") from e

        fault = self._first_text(root, "faultstring")
        if fault:
            raise AfipIntegrationError(f"wsaa_fault:{fault}")

        ticket_response = self._first_text(root, "loginCmsReturn")
        if not ticket_response:
            raise AfipIntegrationError("wsaa_missing_loginCmsReturn")

        ticket_xml = html.unescape(ticket_response)
        try:
            tra_root = ET.fromstring(ticket_xml)
        except Exception as e:
            raise AfipIntegrationError(f"wsaa_ticket_parse_error:{e}") from e

        token = self._first_text(tra_root, "token")
        sign = self._first_text(tra_root, "sign")
        if not token or not sign:
            raise AfipIntegrationError("wsaa_missing_token_or_sign")
        return token, sign

    def _wsfe_post(self, body_xml: str) -> ET.Element:
        _, wsfe_url = self._service_urls()
        envelope = f"""<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<soapenv:Envelope xmlns:soapenv=\"{SOAP_ENV_NS}\" xmlns:ar=\"http://ar.gov.afip.dif.FEV1/\">
  <soapenv:Body>
    {body_xml}
  </soapenv:Body>
</soapenv:Envelope>"""
        try:
            r = requests.post(
                wsfe_url,
                data=envelope.encode("utf-8"),
                headers={"Content-Type": "text/xml; charset=utf-8"},
                timeout=30,
            )
            r.raise_for_status()
        except Exception as e:
            raise AfipIntegrationError(f"wsfe_http_error:{e}") from e

        try:
            root = ET.fromstring(r.text)
        except Exception as e:
            raise AfipIntegrationError(f"wsfe_xml_parse_error:{e}") from e

        fault = self._first_text(root, "faultstring")
        if fault:
            raise AfipIntegrationError(f"wsfe_fault:{fault}")
        return root

    def ping(self) -> dict[str, Any]:
        self._require_config()
        token, sign = self._wsaa_token_sign()
        body = f"""
<ar:FECompUltimoAutorizado>
  <ar:Auth>
    <ar:Token>{token}</ar:Token>
    <ar:Sign>{sign}</ar:Sign>
    <ar:Cuit>{int(self.cuit)}</ar:Cuit>
  </ar:Auth>
  <ar:PtoVta>1</ar:PtoVta>
  <ar:CbteTipo>6</ar:CbteTipo>
</ar:FECompUltimoAutorizado>
"""
        root = self._wsfe_post(body)
        last = int(self._first_text(root, "CbteNro") or 0)
        return {"env": self.env, "status": "ok", "sample_last_cbte": last}

    def issue_invoice(
        self,
        *,
        point_of_sale: int,
        invoice_type: str,
        total: Decimal,
        iva_percent: Decimal,
        issue_date: date,
        due_date: date,
        concept: int = 2,
        doc_type: int = 99,
        doc_number: int = 0,
    ) -> AfipIssuedInvoice:
        cbte_type_map = {"A": 1, "B": 6}
        cbte_type = cbte_type_map.get((invoice_type or "").upper())
        if not cbte_type:
            raise AfipIntegrationError(f"unsupported_invoice_type:{invoice_type}")

        self._require_config()
        token, sign = self._wsaa_token_sign()

        # Ultimo numero AFIP
        body_last = f"""
<ar:FECompUltimoAutorizado>
  <ar:Auth>
    <ar:Token>{token}</ar:Token>
    <ar:Sign>{sign}</ar:Sign>
    <ar:Cuit>{int(self.cuit)}</ar:Cuit>
  </ar:Auth>
  <ar:PtoVta>{int(point_of_sale)}</ar:PtoVta>
  <ar:CbteTipo>{int(cbte_type)}</ar:CbteTipo>
</ar:FECompUltimoAutorizado>
"""
        last_root = self._wsfe_post(body_last)
        last = int(self._first_text(last_root, "CbteNro") or 0)
        cbte_nro = last + 1

        total = self._to_2(Decimal(str(total)))
        iva_percent = Decimal(str(iva_percent or 21))
        divisor = Decimal("1") + (iva_percent / Decimal("100"))
        imp_neto = self._to_2(total / divisor)
        imp_iva = self._to_2(total - imp_neto)

        body_issue = f"""
<ar:FECAESolicitar>
  <ar:Auth>
    <ar:Token>{token}</ar:Token>
    <ar:Sign>{sign}</ar:Sign>
    <ar:Cuit>{int(self.cuit)}</ar:Cuit>
  </ar:Auth>
  <ar:FeCAEReq>
    <ar:FeCabReq>
      <ar:CantReg>1</ar:CantReg>
      <ar:PtoVta>{int(point_of_sale)}</ar:PtoVta>
      <ar:CbteTipo>{int(cbte_type)}</ar:CbteTipo>
    </ar:FeCabReq>
    <ar:FeDetReq>
      <ar:FECAEDetRequest>
        <ar:Concepto>{int(concept)}</ar:Concepto>
        <ar:DocTipo>{int(doc_type)}</ar:DocTipo>
        <ar:DocNro>{int(doc_number)}</ar:DocNro>
        <ar:CbteDesde>{cbte_nro}</ar:CbteDesde>
        <ar:CbteHasta>{cbte_nro}</ar:CbteHasta>
        <ar:CbteFch>{self._fmt_date(issue_date)}</ar:CbteFch>
        <ar:FchServDesde>{self._fmt_date(issue_date)}</ar:FchServDesde>
        <ar:FchServHasta>{self._fmt_date(issue_date)}</ar:FchServHasta>
        <ar:FchVtoPago>{self._fmt_date(due_date)}</ar:FchVtoPago>
        <ar:ImpTotal>{float(total):.2f}</ar:ImpTotal>
        <ar:ImpTotConc>0.00</ar:ImpTotConc>
        <ar:ImpNeto>{float(imp_neto):.2f}</ar:ImpNeto>
        <ar:ImpOpEx>0.00</ar:ImpOpEx>
        <ar:ImpTrib>0.00</ar:ImpTrib>
        <ar:ImpIVA>{float(imp_iva):.2f}</ar:ImpIVA>
        <ar:MonId>PES</ar:MonId>
        <ar:MonCotiz>1</ar:MonCotiz>
        <ar:Iva>
          <ar:AlicIva>
            <ar:Id>5</ar:Id>
            <ar:BaseImp>{float(imp_neto):.2f}</ar:BaseImp>
            <ar:Importe>{float(imp_iva):.2f}</ar:Importe>
          </ar:AlicIva>
        </ar:Iva>
      </ar:FECAEDetRequest>
    </ar:FeDetReq>
  </ar:FeCAEReq>
</ar:FECAESolicitar>
"""

        issue_root = self._wsfe_post(body_issue)

        errs: list[str] = []
        for node in issue_root.iter():
            if self._local_name(node.tag) == "Err":
                code = self._first_text(node, "Code")
                msg = self._first_text(node, "Msg")
                errs.append(f"{code}:{msg}" if code else msg)
        if errs:
            raise AfipIntegrationError(f"afip_errors:{' | '.join([e for e in errs if e])}")

        result = self._first_text(issue_root, "Resultado") or ""
        cae = self._first_text(issue_root, "CAE")
        cae_vto_raw = self._first_text(issue_root, "CAEFchVto")

        if not cae:
            raise AfipIntegrationError("afip_missing_cae")

        obs: list[dict[str, str]] = []
        for node in issue_root.iter():
            if self._local_name(node.tag) == "Obs":
                code = self._first_text(node, "Code")
                msg = self._first_text(node, "Msg")
                obs.append({"code": code, "message": msg})

        return AfipIssuedInvoice(
            cbte_number=int(cbte_nro),
            cae=str(cae),
            cae_due_date=self._parse_afip_date(cae_vto_raw),
            result=(result or "A"),
            obs=obs,
        )
