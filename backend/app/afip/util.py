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


# Códigos AFIP/ARCA de "Condición IVA Receptor" (RG 5616) que usa el sistema.
IVA_CONDITION_LABELS = {
    1: "Responsable Inscripto",
    6: "Monotributo",
    4: "Exento",
    5: "Consumidor Final",
}

DEFAULT_IVA_CONDITION_COMPANY = 1  # Responsable Inscripto
DEFAULT_IVA_CONDITION_PERSON = 5  # Consumidor Final

# ARCA sólo admite Responsable Inscripto y Monotributo en Factura A, y el
# resto en Factura B; nunca los dos (FEParamGetCondicionIvaReceptor).
INVOICE_TYPE_BY_IVA_CONDITION = {
    1: "A",
    6: "A",
    4: "B",
    5: "B",
}


def invoice_type_for_iva_condition(iva_condition: int | None) -> str | None:
    """Tipo de comprobante (A/B) que corresponde a esa condición de IVA, o None si no se reconoce."""
    return INVOICE_TYPE_BY_IVA_CONDITION.get(int(iva_condition) if iva_condition is not None else None)


