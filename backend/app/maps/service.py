"""
Lógica de negocio de las órdenes de instalación.

Flujo al crear una solicitud con ubicación:
  1. GET /a (disponibilidad) → lista de NAPs con capacidad, más cercano primero.
     - vacía → orden SIN_COBERTURA (apartado "sin cobertura")
     - hay   → se toma la PRIMERA opción (la más cercana con disponibilidad)
  2. GET /i (cálculo) → metros de fibra + ruta (para el ticket del técnico)
  3. POST al NAP → Reservados +1 / Disponibles −1 → orden RESERVADO
     con vencimiento = ahora + maps.reservation.ttl_hours (default 168h = 7 días)

Si la API de mapas no está configurada o falla, la orden queda PENDIENTE con
`last_maps_error`; se puede reintentar con el endpoint retry-check.
"""
from datetime import datetime, timedelta
from typing import Optional

from ..extensions import db
from ..logging_utils import slog
from ..models.installation_order import (
    InstallationOrder,
    STATUS_CANCELADA,
    STATUS_INSTALADA,
    STATUS_PENDIENTE,
    STATUS_RESERVADO,
    STATUS_SIN_COBERTURA,
    STATUS_VENCIDA,
)
from .client import (
    MapsClient,
    MapsError,
    MapsNotConfigured,
    dumps_compact,
    parse_availability,
    parse_install_calc,
)


DEFAULT_TTL_HOURS = 168  # 7 días


def _ttl_hours() -> int:
    from ..models.setting import Setting

    s = Setting.query.get("maps.reservation.ttl_hours")
    try:
        v = int(str(s.value).strip()) if s and s.value else DEFAULT_TTL_HOURS
    except ValueError:
        v = DEFAULT_TTL_HOURS
    return max(1, v)


def parse_latlng_text(text: Optional[str]) -> tuple[Optional[float], Optional[float]]:
    """Si el texto es 'lat,lng' plano, lo parsea para persistir coordenadas."""
    raw = (text or "").strip()
    if not raw or "/" in raw or "http" in raw.lower():
        return None, None
    parts = [p.strip() for p in raw.replace(";", ",").split(",")]
    if len(parts) != 2:
        return None, None
    try:
        lat, lng = float(parts[0]), float(parts[1])
    except ValueError:
        return None, None
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return None, None
    return lat, lng


def run_coverage_check(order: InstallationOrder) -> InstallationOrder:
    """Ejecuta chequeo de disponibilidad + cálculo + reserva para una orden.

    Actualiza la orden in-place (sin commit; el caller decide cuándo commitear).
    """
    now = datetime.utcnow()
    order.last_maps_error = None

    try:
        mc = MapsClient()
    except MapsNotConfigured:
        order.status = STATUS_PENDIENTE
        order.last_maps_error = "API de mapas no configurada (MAPS_API_BASE_URL / MAPS_API_KEY)"
        return order

    loc_kwargs = {}
    if order.location_url:
        loc_kwargs["url"] = order.location_url
    elif order.latitude is not None and order.longitude is not None:
        loc_kwargs["lat"] = order.latitude
        loc_kwargs["lng"] = order.longitude
    else:
        order.status = STATUS_PENDIENTE
        order.last_maps_error = "La orden no tiene ubicación (link o lat/lng)"
        return order

    # 1) Disponibilidad
    try:
        avail_raw = mc.check_availability(**loc_kwargs)
    except MapsError as e:
        order.status = STATUS_PENDIENTE
        order.last_maps_error = f"availability: {e.code} {e.message}"[:500]
        return order

    avail = parse_availability(avail_raw)
    order.availability_json = dumps_compact(avail_raw)

    if not avail["available"] or not avail["naps"]:
        order.status = STATUS_SIN_COBERTURA
        slog(
            module="INSTALL",
            action="NO_COVERAGE",
            message=f"Orden #{order.id or '?'}: sin cobertura en la ubicación",
            details={"order_id": order.id, "location": order.location_url},
            ref_id=order.id,
            ref_type="installation_order",
        )
        return order

    # Primera opción disponible = la más cercana con capacidad.
    chosen = avail["naps"][0]
    order.nap_ref = chosen.get("ref") or chosen.get("name")
    order.nap_name = chosen.get("name") or chosen.get("ref")

    # 2) Cálculo de instalación (metros de fibra + ruta). No bloquea la reserva si falla.
    try:
        calc_raw = mc.calculate_install(**loc_kwargs)
        calc = parse_install_calc(calc_raw)
        order.install_calc_json = dumps_compact(calc_raw)
        if calc["fiber_meters"] is not None:
            order.fiber_meters = calc["fiber_meters"]
        # Si /i no coincide con el NAP elegido de /a, priorizamos el de /a
        # (primera opción CON capacidad); /i aporta los metros de fibra.
    except MapsError as e:
        order.install_calc_json = None
        order.last_maps_error = f"install_calc: {e.code} {e.message}"[:500]

    # 3) Reserva del puerto en el NAP elegido
    if not order.nap_ref:
        order.status = STATUS_PENDIENTE
        order.last_maps_error = "No se pudo identificar el NAP a reservar (respuesta sin id/nombre)"
        return order

    try:
        mc.reserve_port(order.nap_ref)
    except MapsError as e:
        order.status = STATUS_PENDIENTE
        order.last_maps_error = f"reserve: {e.code} {e.message}"[:500]
        return order

    order.status = STATUS_RESERVADO
    order.reserved_at = now
    order.expires_at = now + timedelta(hours=_ttl_hours())
    slog(
        module="INSTALL",
        action="PORT_RESERVED",
        message=f"Orden #{order.id or '?'}: puerto reservado en NAP {order.nap_name or order.nap_ref}",
        details={
            "order_id": order.id,
            "nap": order.nap_ref,
            "fiber_meters": (str(order.fiber_meters) if order.fiber_meters is not None else None),
            "expires_at": order.expires_at.isoformat(),
        },
        ref_id=order.id,
        ref_type="installation_order",
    )
    return order


def create_order(
    *,
    client_id: int,
    connection_id: Optional[int],
    location_url: Optional[str],
    lat=None,
    lng=None,
    notes: Optional[str] = None,
    run_check: bool = True,
) -> InstallationOrder:
    """Crea una orden de instalación y (opcionalmente) corre el chequeo+reserva."""
    if lat is None and lng is None:
        lat, lng = parse_latlng_text(location_url)

    order = InstallationOrder(
        client_id=int(client_id),
        connection_id=(int(connection_id) if connection_id else None),
        location_url=(str(location_url).strip()[:1000] if location_url else None),
        latitude=lat,
        longitude=lng,
        status=STATUS_PENDIENTE,
        notes=(notes or None),
    )
    db.session.add(order)
    db.session.flush()  # asigna order.id para logs

    if run_check:
        run_coverage_check(order)
    return order


def release_reservation(order: InstallationOrder, *, reason: str) -> Optional[str]:
    """Libera el puerto reservado en el mapa. Devuelve mensaje de error o None."""
    if not order.nap_ref:
        return None
    try:
        mc = MapsClient()
        mc.release_port(order.nap_ref)
        return None
    except MapsError as e:
        msg = f"release ({reason}): {e.code} {e.message}"[:500]
        order.last_maps_error = msg
        return msg


def expire_order(order: InstallationOrder) -> None:
    """Marca una reserva vencida y libera el puerto (usado por el cron)."""
    now = datetime.utcnow()
    err = release_reservation(order, reason="vencimiento")
    order.status = STATUS_VENCIDA
    order.expired_at = now
    slog(
        module="INSTALL",
        action="RESERVATION_EXPIRED",
        message=f"Orden #{order.id}: reserva vencida, puerto liberado en NAP {order.nap_name or order.nap_ref}",
        level=("WARNING" if err else "INFO"),
        details={"order_id": order.id, "nap": order.nap_ref, "release_error": err},
        ref_id=order.id,
        ref_type="installation_order",
    )


def confirm_order(order: InstallationOrder, *, source: str) -> None:
    """Confirma la instalación (webhook del mapa o acción manual).

    No toca contadores del NAP: la app de mapas mueve Reservados→Ocupados
    de su lado al confirmar.
    """
    order.status = STATUS_INSTALADA
    order.confirmed_at = datetime.utcnow()
    slog(
        module="INSTALL",
        action="INSTALL_CONFIRMED",
        message=f"Orden #{order.id}: instalación confirmada ({source})",
        details={"order_id": order.id, "nap": order.nap_ref, "source": source},
        ref_id=order.id,
        ref_type="installation_order",
    )


def cancel_order(order: InstallationOrder) -> None:
    """Cancela la orden; si tenía reserva vigente, libera el puerto."""
    if order.status == STATUS_RESERVADO:
        release_reservation(order, reason="cancelación")
    order.status = STATUS_CANCELADA
    slog(
        module="INSTALL",
        action="ORDER_CANCELLED",
        message=f"Orden #{order.id}: cancelada",
        details={"order_id": order.id, "nap": order.nap_ref},
        ref_id=order.id,
        ref_type="installation_order",
    )
