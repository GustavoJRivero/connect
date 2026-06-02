"""
Helpers de zona horaria de la app.

Convenciones:
- En la base de datos guardamos datetimes "naive" en UTC (`default=datetime.utcnow`).
- Al serializar a JSON usamos `iso_utc(...)` para que el ISO string lleve `+00:00`,
  así el frontend (`new Date(...)`) los interpreta correctamente y los puede formatear
  en la TZ configurada.
- Para lógica de negocio que depende del "día de hoy" (vencimientos, facturación,
  scheduler) usamos `today_local()` / `now_local()` con la TZ configurada
  (`APP_TIMEZONE`, default `America/Argentina/Buenos_Aires`).
"""
from __future__ import annotations

import os
from datetime import date, datetime, timezone
from typing import Optional

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover (Python <3.9 no soportado)
    ZoneInfo = None  # type: ignore


DEFAULT_APP_TIMEZONE = "America/Argentina/Buenos_Aires"


def get_app_tz_name() -> str:
    """Nombre IANA de la TZ configurada para la app."""
    return (os.getenv("APP_TIMEZONE") or DEFAULT_APP_TIMEZONE).strip() or DEFAULT_APP_TIMEZONE


def get_app_tz() -> "ZoneInfo":
    """Devuelve un ZoneInfo. Si la TZ configurada es inválida cae en el default."""
    if ZoneInfo is None:
        raise RuntimeError("zoneinfo no está disponible en esta versión de Python")
    name = get_app_tz_name()
    try:
        return ZoneInfo(name)
    except Exception:
        return ZoneInfo(DEFAULT_APP_TIMEZONE)


def now_local() -> datetime:
    """Datetime actual con la TZ configurada (aware)."""
    return datetime.now(tz=get_app_tz())


def today_local() -> date:
    """Fecha 'hoy' interpretada en la TZ configurada (no UTC)."""
    return now_local().date()


def to_local(dt: Optional[datetime]) -> Optional[datetime]:
    """Convierte un datetime (UTC naive o aware) a la TZ configurada. Devuelve aware."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(get_app_tz())


def iso_utc(dt: Optional[datetime]) -> Optional[str]:
    """Serializa un datetime como ISO 8601 en UTC con offset explícito (`+00:00`).

    - `None` -> `None`.
    - datetime naive -> se asume UTC (matchea `default=datetime.utcnow` del modelo).
    - datetime aware -> se convierte a UTC.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.isoformat()


def offset_minutes() -> int:
    """Offset actual de la TZ configurada vs UTC, en minutos (Argentina = -180)."""
    delta = now_local().utcoffset()
    if not delta:
        return 0
    return int(delta.total_seconds() // 60)
