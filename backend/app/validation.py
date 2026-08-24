"""Validación de campos de cliente/conexión.

Evita 500 por overflow de VARCHAR y rechaza datos claramente inválidos
con 400 y un código estable para el frontend.
"""
from __future__ import annotations

import re
from typing import Any, Optional


class ValidationError(Exception):
    def __init__(self, code: str, message: str, extra: Optional[dict] = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.extra = extra or {}

    def to_response(self):
        from flask import jsonify

        payload = {"error": self.code, "message": self.message}
        payload.update(self.extra)
        return jsonify(payload), 400


def blank_to_none(value: Any) -> Optional[str]:
    if value is None:
        return None
    s = str(value).strip()
    return s or None


def _too_long(value: Optional[str], max_len: int, field: str) -> None:
    if value is not None and len(value) > max_len:
        raise ValidationError(
            "field_too_long",
            f"El campo supera el máximo de {max_len} caracteres.",
            {"field": field, "max": max_len},
        )


def optional_str(value: Any, max_len: int, field: str) -> Optional[str]:
    s = blank_to_none(value)
    _too_long(s, max_len, field)
    return s


def validate_full_name(value: Any) -> str:
    s = (value or "").strip() if value is not None else ""
    if not s:
        raise ValidationError("full_name_required", "Ingresá el nombre o razón social.")
    if len(s) < 2:
        raise ValidationError("full_name_too_short", "El nombre debe tener al menos 2 caracteres.")
    if not re.search(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]", s):
        raise ValidationError("full_name_invalid", "El nombre debe incluir al menos una letra.")
    _too_long(s, 200, "full_name")
    return s


def normalize_dni(value: Any) -> Optional[str]:
    """Valida DNI argentino con python-stdnum (formato oficial: 7-8 dígitos).

    RENAPER no publica una API abierta para comprobar si el documento existe;
    esto valida que el número sea un DNI bien formado.
    """
    from stdnum.ar import dni as ar_dni
    from stdnum.exceptions import ValidationError as StdnumError

    s = blank_to_none(value)
    if not s:
        return None
    try:
        return ar_dni.validate(s)
    except StdnumError:
        raise ValidationError("dni_invalid", "El DNI no es válido (debe tener 7 u 8 dígitos).")


def normalize_cuit(value: Any) -> Optional[str]:
    """Valida CUIT/CUIL con el dígito verificador oficial de AFIP (python-stdnum)."""
    from stdnum.ar import cuit as ar_cuit
    from stdnum.exceptions import ValidationError as StdnumError

    s = blank_to_none(value)
    if not s:
        return None
    try:
        return ar_cuit.validate(s)
    except StdnumError:
        raise ValidationError("cuit_invalid", "El CUIT no es válido (revisá el número y el dígito verificador).")


def dni_exists(dni: str, exclude_id: Optional[int] = None):
    from .models.client import Client

    q = Client.query.filter(Client.dni.isnot(None))
    if exclude_id is not None:
        q = q.filter(Client.id != int(exclude_id))
    for other in q:
        try:
            other_n = normalize_dni(other.dni)
        except ValidationError:
            other_n = blank_to_none(other.dni)
        if other_n == dni:
            return other
    return None


def cuit_exists(cuit: str, exclude_id: Optional[int] = None):
    from .models.client import Client

    q = Client.query.filter(Client.cuit.isnot(None))
    if exclude_id is not None:
        q = q.filter(Client.id != int(exclude_id))
    for other in q:
        try:
            other_n = normalize_cuit(other.cuit)
        except ValidationError:
            other_n = re.sub(r"\D", "", str(other.cuit or ""))
        if other_n == cuit:
            return other
    return None


def validate_phone(value: Any) -> Optional[str]:
    s = blank_to_none(value)
    if not s:
        return None
    _too_long(s, 50, "phone")
    digits = re.sub(r"\D", "", s)
    if len(digits) < 6:
        raise ValidationError("phone_invalid", "El teléfono debe tener al menos 6 dígitos.")
    return s


def validate_email(value: Any) -> Optional[str]:
    s = blank_to_none(value)
    if not s:
        return None
    _too_long(s, 200, "email")
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", s):
        raise ValidationError("email_invalid", "El email no tiene un formato válido.")
    return s.lower()
