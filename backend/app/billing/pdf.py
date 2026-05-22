"""
Generador de PDF para facturas.

Genera un comprobante con formato profesional usando ReportLab.
"""
import io
from datetime import date
from decimal import Decimal

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT

from ..models.invoice import Invoice
from ..models.client import Client
from ..models.connection import Connection
from ..models.plan import Plan
from ..models.setting import Setting


def _get_setting(key: str, default: str = "") -> str:
    s = Setting.query.get(key)
    return s.value if s and s.value else default


def _format_money(val) -> str:
    try:
        d = Decimal(str(val))
        return f"$ {d:,.2f}"
    except Exception:
        return f"$ {val}"


def _format_date(d) -> str:
    if not d:
        return "-"
    if isinstance(d, str):
        return d
    return d.strftime("%d/%m/%Y")


def generate_invoice_pdf(invoice: Invoice) -> bytes:
    """Genera un PDF de la factura y lo retorna como bytes."""

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

    # Custom styles
    style_title = ParagraphStyle(
        "InvTitle",
        parent=styles["Heading1"],
        fontSize=18,
        alignment=TA_CENTER,
        spaceAfter=2 * mm,
        textColor=colors.HexColor("#1a1a2e"),
    )
    style_subtitle = ParagraphStyle(
        "InvSubtitle",
        parent=styles["Normal"],
        fontSize=11,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#666666"),
        spaceAfter=6 * mm,
    )
    style_section = ParagraphStyle(
        "Section",
        parent=styles["Heading3"],
        fontSize=11,
        textColor=colors.HexColor("#1a1a2e"),
        spaceBefore=4 * mm,
        spaceAfter=2 * mm,
    )
    style_normal = styles["Normal"]
    style_small = ParagraphStyle(
        "Small",
        parent=styles["Normal"],
        fontSize=8,
        textColor=colors.HexColor("#999999"),
    )
    style_right = ParagraphStyle(
        "Right",
        parent=styles["Normal"],
        alignment=TA_RIGHT,
    )
    style_total_label = ParagraphStyle(
        "TotalLabel",
        parent=styles["Normal"],
        fontSize=12,
        alignment=TA_RIGHT,
        textColor=colors.HexColor("#333333"),
    )
    style_total_value = ParagraphStyle(
        "TotalValue",
        parent=styles["Normal"],
        fontSize=14,
        alignment=TA_RIGHT,
        textColor=colors.HexColor("#1a1a2e"),
    )

    elements = []

    # --- Header ---
    issuer_name = _get_setting("issuer.name", "Connect ISP")
    issuer_cuit = invoice.issuer_cuit or _get_setting("issuer.cuit", "")
    issuer_address = _get_setting("issuer.address", "")
    issuer_phone = _get_setting("issuer.phone", "")
    issuer_email = _get_setting("issuer.email", "")

    inv_type_map = {"A": "FACTURA A", "B": "FACTURA B", "X": "COMPROBANTE X"}
    inv_type_label = inv_type_map.get(invoice.invoice_type, f"COMPROBANTE {invoice.invoice_type}")

    elements.append(Paragraph(issuer_name, style_title))

    cbte_num = ""
    if invoice.cbte_number:
        pv = str(invoice.point_of_sale).zfill(5)
        num = str(invoice.cbte_number).zfill(8)
        cbte_num = f" N° {pv}-{num}"

    elements.append(Paragraph(f"{inv_type_label}{cbte_num}", style_subtitle))

    elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#dddddd")))
    elements.append(Spacer(1, 3 * mm))

    # --- Invoice info + Issuer info side by side ---
    issuer_lines = []
    if issuer_cuit:
        issuer_lines.append(f"CUIT: {issuer_cuit}")
    if issuer_address:
        issuer_lines.append(issuer_address)
    if issuer_phone:
        issuer_lines.append(f"Tel: {issuer_phone}")
    if issuer_email:
        issuer_lines.append(f"Email: {issuer_email}")

    left_info = [
        f"<b>Fecha de emisión:</b> {_format_date(invoice.issue_date)}",
        f"<b>Fecha de vencimiento:</b> {_format_date(invoice.due_date)}",
    ]
    if invoice.period_start and invoice.period_end:
        left_info.append(
            f"<b>Período:</b> {_format_date(invoice.period_start)} al {_format_date(invoice.period_end)}"
        )
    if invoice.cae:
        left_info.append(f"<b>CAE:</b> {invoice.cae}")
        if invoice.cae_due_date:
            left_info.append(f"<b>Vto. CAE:</b> {_format_date(invoice.cae_due_date)}")

    left_para = "<br/>".join(left_info)
    right_para = "<br/>".join(issuer_lines) if issuer_lines else ""

    info_data = [[Paragraph(left_para, style_normal), Paragraph(right_para, style_right)]]
    info_table = Table(info_data, colWidths=["55%", "45%"])
    info_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    elements.append(info_table)
    elements.append(Spacer(1, 5 * mm))

    # --- Client info ---
    client = Client.query.get(invoice.client_id)
    elements.append(Paragraph("DATOS DEL CLIENTE", style_section))

    client_data = []
    if client:
        client_data.append(["Nombre / Razón social", client.full_name or "-"])
        if client.dni:
            client_data.append(["DNI", client.dni])
        if client.cuit:
            client_data.append(["CUIT", client.cuit])
        if client.address:
            client_data.append(["Domicilio", client.address])
        if client.email:
            client_data.append(["Email", client.email])
        if client.phone:
            client_data.append(["Teléfono", client.phone])
    else:
        client_data.append(["Cliente ID", str(invoice.client_id)])

    client_table = Table(client_data, colWidths=[45 * mm, None])
    client_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#555555")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
    ]))
    elements.append(client_table)
    elements.append(Spacer(1, 5 * mm))

    # --- Detail lines ---
    elements.append(Paragraph("DETALLE", style_section))

    connection = Connection.query.get(invoice.connection_id) if invoice.connection_id else None
    plan = None
    if connection:
        plan = Plan.query.filter_by(profile=connection.plan_profile).first()

    detail_header = ["Descripción", "Cant.", "P. Unit.", "Subtotal"]

    detail_rows = [detail_header]

    custom_desc = getattr(invoice, "description", None)

    if custom_desc:
        detail_rows.append([
            custom_desc,
            "1",
            _format_money(invoice.total),
            _format_money(invoice.total),
        ])
    elif plan:
        desc = f"Servicio de internet - Plan {plan.name} ({plan.download_mbps}/{plan.upload_mbps} Mbps)"
        price_net = plan.price_net
        iva_pct = plan.iva_percent
        iva_amount = plan.iva_amount

        detail_rows.append([
            desc,
            "1",
            _format_money(price_net),
            _format_money(price_net),
        ])

        if iva_pct and iva_pct > 0:
            detail_rows.append([
                f"IVA ({iva_pct}%)",
                "",
                "",
                _format_money(iva_amount),
            ])
    else:
        period_txt = ""
        if invoice.period_start and invoice.period_end:
            period_txt = f" ({_format_date(invoice.period_start)} al {_format_date(invoice.period_end)})"
        detail_rows.append([
            f"Servicio de internet{period_txt}",
            "1",
            _format_money(invoice.total),
            _format_money(invoice.total),
        ])

    detail_table = Table(detail_rows, colWidths=["50%", "10%", "20%", "20%"])
    detail_table.setStyle(TableStyle([
        # Header
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("ALIGNMENT", (1, 0), (-1, -1), "RIGHT"),
        ("ALIGNMENT", (0, 0), (0, -1), "LEFT"),
        # Body
        ("FONTSIZE", (0, 1), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("GRID", (0, 0), (-1, 0), 0.5, colors.HexColor("#1a1a2e")),
        ("LINEBELOW", (0, -1), (-1, -1), 0.5, colors.HexColor("#cccccc")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9f9f9")]),
    ]))
    elements.append(detail_table)
    elements.append(Spacer(1, 6 * mm))

    # --- Totals ---
    total_val = Decimal(str(invoice.total or 0))
    paid_val = Decimal(str(invoice.paid_total or 0))
    balance = total_val - paid_val

    totals_data = [
        [Paragraph("<b>TOTAL</b>", style_total_label), Paragraph(f"<b>{_format_money(total_val)}</b>", style_total_value)],
    ]
    if paid_val > 0:
        totals_data.append([
            Paragraph("Pagado", style_total_label),
            Paragraph(_format_money(paid_val), style_total_value),
        ])
        totals_data.append([
            Paragraph("<b>Saldo</b>", style_total_label),
            Paragraph(f"<b>{_format_money(balance)}</b>", style_total_value),
        ])

    totals_table = Table(totals_data, colWidths=["70%", "30%"])
    totals_table.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, 0), 1, colors.HexColor("#1a1a2e")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(totals_table)
    elements.append(Spacer(1, 8 * mm))

    # --- Notes ---
    invoice_notes = getattr(invoice, "notes", None)
    if invoice_notes:
        elements.append(Paragraph("OBSERVACIONES", style_section))
        elements.append(Paragraph(str(invoice_notes), style_normal))
        elements.append(Spacer(1, 6 * mm))

    # --- Status ---
    status_map = {
        "DRAFT": "BORRADOR",
        "ISSUED": "EMITIDA",
        "PAID": "PAGADA",
        "VOID": "ANULADA",
    }
    status_label = status_map.get(invoice.status, invoice.status)
    status_color = {
        "DRAFT": "#999999",
        "ISSUED": "#2196F3",
        "PAID": "#4CAF50",
        "VOID": "#f44336",
    }.get(invoice.status, "#333333")

    style_status = ParagraphStyle(
        "Status",
        parent=styles["Normal"],
        fontSize=12,
        alignment=TA_CENTER,
        textColor=colors.HexColor(status_color),
    )
    elements.append(Paragraph(f"Estado: <b>{status_label}</b>", style_status))

    elements.append(Spacer(1, 10 * mm))
    elements.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#dddddd")))
    elements.append(Spacer(1, 2 * mm))
    elements.append(Paragraph(
        f"Documento generado el {_format_date(date.today())} — {issuer_name}",
        style_small,
    ))

    doc.build(elements)
    return buf.getvalue()
