"""
Generador de PDF de la orden de trabajo (instalación) para el técnico.

Mismo estilo/stack que el PDF de facturas (ReportLab).
"""
import io
import json

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from ..models.installation_order import InstallationOrder
from ..models.setting import Setting


def _get_setting(key: str, default: str = "") -> str:
    s = Setting.query.get(key)
    return s.value if s and s.value else default


def _fmt_dt(dt) -> str:
    if not dt:
        return "-"
    return dt.strftime("%d/%m/%Y %H:%M")


STATUS_LABELS = {
    "PENDIENTE": "Pendiente",
    "RESERVADO": "Reservado",
    "SIN_COBERTURA": "Sin cobertura",
    "INSTALADA": "Instalada",
    "VENCIDA": "Vencida",
    "CANCELADA": "Cancelada",
}


def generate_work_order_pdf(order: InstallationOrder) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
    )

    styles = getSampleStyleSheet()
    style_title = ParagraphStyle(
        "WoTitle", parent=styles["Heading1"], fontSize=16, alignment=TA_CENTER,
        spaceAfter=2 * mm, textColor=colors.HexColor("#1a1a2e"),
    )
    style_subtitle = ParagraphStyle(
        "WoSubtitle", parent=styles["Normal"], fontSize=10, alignment=TA_CENTER,
        textColor=colors.HexColor("#666666"), spaceAfter=5 * mm,
    )
    style_section = ParagraphStyle(
        "WoSection", parent=styles["Heading3"], fontSize=11,
        textColor=colors.HexColor("#1a1a2e"), spaceBefore=4 * mm, spaceAfter=2 * mm,
    )
    style_normal = styles["Normal"]

    client = order.client
    conn = order.connection

    elements = []

    issuer_name = _get_setting("issuer.name", "Connect ISP")
    elements.append(Paragraph(f"{issuer_name} — Orden de instalación #{order.id}", style_title))
    status_label = STATUS_LABELS.get(order.status, order.status)
    elements.append(Paragraph(f"Estado: {status_label} · Emitida: {_fmt_dt(order.created_at)}", style_subtitle))
    elements.append(HRFlowable(width="100%", color=colors.HexColor("#dddddd")))

    def kv_table(rows):
        t = Table([[Paragraph(f"<b>{k}</b>", style_normal), Paragraph(str(v or "-"), style_normal)] for k, v in rows], colWidths=[45 * mm, 125 * mm])
        t.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
        ]))
        return t

    # --- Cliente ---
    elements.append(Paragraph("Cliente", style_section))
    elements.append(kv_table([
        ("Nombre", client.full_name if client else "-"),
        ("Teléfono", client.phone if client else "-"),
        ("Documento", (client.dni or client.cuit) if client else "-"),
        ("Dirección", client.address if client else "-"),
    ]))

    # --- Servicio ---
    elements.append(Paragraph("Servicio a instalar", style_section))
    elements.append(kv_table([
        ("Conexión", f"#{conn.id}" if conn else "-"),
        ("Plan", conn.plan_profile if conn else "-"),
        ("Domicilio del servicio", conn.service_address if conn else "-"),
        ("Usuario PPPoE", conn.pppoe_name() if conn else "-"),
        ("IP asignada", (conn.ip or "-") if conn else "-"),
        ("PON SN", (conn.pon_sn or "-") if conn else "-"),
    ]))

    # --- Ubicación y red ---
    lat_lng = "-"
    if order.latitude is not None and order.longitude is not None:
        lat_lng = f"{order.latitude}, {order.longitude}"
    elements.append(Paragraph("Ubicación y datos de red", style_section))
    elements.append(kv_table([
        ("Link de ubicación", order.location_url or "-"),
        ("Coordenadas", lat_lng),
        ("NAP asignado", order.nap_name or order.nap_ref or "-"),
        ("Fibra estimada", (f"{order.fiber_meters} m" if order.fiber_meters is not None else "-")),
        ("Reservado", _fmt_dt(order.reserved_at)),
        ("Vence reserva", _fmt_dt(order.expires_at)),
    ]))

    # --- Detalle del NAP (infoTable del cálculo, si lo tenemos) ---
    nap_info = None
    if order.install_calc_json:
        try:
            raw = json.loads(order.install_calc_json)
            for key in ("nap", "nearestNap", "nearest_nap", "feature", "target"):
                item = raw.get(key)
                if isinstance(item, dict) and isinstance(item.get("infoTable"), dict):
                    nap_info = item["infoTable"]
                    break
        except (ValueError, AttributeError):
            nap_info = None
    if nap_info:
        elements.append(Paragraph("Detalle del NAP", style_section))
        elements.append(kv_table([(str(k), str(v)) for k, v in list(nap_info.items())[:12]]))

    # --- Operativo ---
    elements.append(Paragraph("Datos operativos", style_section))
    elements.append(kv_table([
        ("Técnico asignado", order.technician or "-"),
        ("Notas", order.notes or "-"),
    ]))

    elements.append(Spacer(1, 14 * mm))
    sign = Table(
        [[Paragraph("Firma del técnico", style_normal), Paragraph("Firma del cliente", style_normal)]],
        colWidths=[85 * mm, 85 * mm],
    )
    sign.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (0, 0), 0.5, colors.HexColor("#999999")),
        ("LINEABOVE", (1, 0), (1, 0), 0.5, colors.HexColor("#999999")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
    ]))
    elements.append(sign)

    doc.build(elements)
    return buf.getvalue()
