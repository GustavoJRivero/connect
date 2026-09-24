"""
Utilidades AFIP compartidas entre la emisión (WSFE) y la generación de
comprobantes (PDF/QR), para no duplicar los mapeos de tipo de comprobante
y tipo de documento del receptor.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..models.client import Client

# Código de comprobante AFIP (CbteTipo) según la letra usada internamente.
# Sólo cubre lo que este sistema factura hoy (A/B). "X" (comprobante no
# fiscal) no tiene código AFIP: nunca se emite con CAE.
CBTE_TYPE_MAP = {"A": 1, "B": 6}


def cbte_type_for(invoice_type: str) -> int | None:
    """Código AFIP (CbteTipo) para la letra de comprobante, o None si no es fiscal."""
    return CBTE_TYPE_MAP.get((invoice_type or "").upper())


def client_doc_for_afip(client: "Client | None") -> tuple[int, int]:
    """
    Devuelve (doc_tipo, doc_nro) para AFIP.
    - CUIT empresa/persona: tipo 80
    - DNI persona: tipo 96
    - sin datos: consumidor final (99, 0)
    """
    if not client:
        return 99, 0
    try:
        if client.cuit:
            raw = "".join(ch for ch in str(client.cuit) if ch.isdigit())
            if raw:
                return 80, int(raw)
        if client.dni:
            raw = "".join(ch for ch in str(client.dni) if ch.isdigit())
            if raw:
                return 96, int(raw)
    except Exception:
        pass
    return 99, 0


# Códigos AFIP/ARCA de "Condición IVA Receptor" (RG 5616) y su etiqueta legible
# para mostrar en el comprobante impreso.
IVA_CONDITION_LABELS = {
    1: "IVA Responsable Inscripto",
    4: "IVA Sujeto Exento",
    5: "Consumidor Final",
    6: "Monotributo",
    13: "Monotributista Social",
    16: "Monotributo Trabajador Independiente Promovido",
}


def iva_condition_receptor_id(invoice_type: str, doc_type: int) -> int:
    """
    Código AFIP/ARCA de Condición IVA del receptor (RG 5616).
    - Factura A → sólo Responsable Inscripto (1).
    - Factura B/otros: consumidor final o DNI → 5; CUIT → 6 (Monotributo,
      caso más común entre clientes de un ISP).
    """
    if (invoice_type or "").upper() == "A":
        return 1
    if doc_type in (99, 96):
        return 5
    return 6


def client_iva_condition_label(client: "Client | None", invoice_type: str) -> str:
    """
    Etiqueta legible de la Condición frente al IVA del receptor, coherente con
    lo que se declara ante AFIP/ARCA al pedir el CAE (misma regla que
    `iva_condition_receptor_id`, para no mostrar en el PDF algo distinto de lo
    que ya se le informó al fisco para este comprobante).
    """
    doc_type, _ = client_doc_for_afip(client)
    code = iva_condition_receptor_id(invoice_type, doc_type)
    return IVA_CONDITION_LABELS.get(code, "Consumidor Final")
