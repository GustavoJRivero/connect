"""
Generador de PDF para facturas.
"""
import base64
import io
import json
import os
from datetime import date
from decimal import Decimal

import qrcode
from flask import current_app
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, FrameBreak,
    Table, TableStyle, Paragraph, Spacer, Image, HRFlowable,
)
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT

from ..afip.util import cbte_type_for, client_doc_for_afip, client_iva_condition_label
from ..models.invoice import Invoice
from ..models.client import Client
from ..timezone import today_local
from ..models.connection import Connection
from ..models.plan import Plan
from ..models.setting import Setting

AFIP_QR_BASE_URL = "https://www.afip.gob.ar/fe/qr/?p="

DEFAULT_LOGO_PATH = os.path.join(os.path.dirname(__file__), "assets", "logo.png")
ARCA_LOGO_PATH = os.path.join(os.path.dirname(__file__), "assets", "logo_arca.jpg")

FONT_REGULAR = "Manrope"
FONT_BOLD = "Manrope-Bold"
FONT_EXTRABOLD = "Manrope-ExtraBold"

FONT_DIR = os.path.join(os.path.dirname(__file__), "assets", "fonts")
_fonts_registered = False


def _ensure_fonts_registered() -> None:
    """Registra las fuentes Manrope embebidas (una sola vez por proceso)."""
    global _fonts_registered
    if _fonts_registered:
        return
    pdfmetrics.registerFont(TTFont(FONT_REGULAR, os.path.join(FONT_DIR, "Manrope-Regular.ttf")))
    pdfmetrics.registerFont(TTFont(FONT_BOLD, os.path.join(FONT_DIR, "Manrope-Bold.ttf")))
    pdfmetrics.registerFont(TTFont(FONT_EXTRABOLD, os.path.join(FONT_DIR, "Manrope-ExtraBold.ttf")))
    pdfmetrics.registerFontFamily(
        FONT_REGULAR, normal=FONT_REGULAR, bold=FONT_BOLD,
        italic=FONT_REGULAR, boldItalic=FONT_BOLD,
    )
    _fonts_registered = True


# Colores: Tinta / Acento / Secundario / Tarjeta / Línea / Blanco.
COLOR_INK = "#1B0539"
COLOR_ACCENT = "#721AFC"
COLOR_SECONDARY = "#6B5A8E"
COLOR_CARD_BG = "#F7F5FB"
COLOR_LINE = "#E7E3EF"

MESES_ES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

# Medidas de página y grilla.
PAGE_MARGIN = 12 * mm
CONTENT_W = 186 * mm

HDR_LEFT_W = 78.5 * mm
HDR_GAP = 6 * mm
HDR_MID_W = 17 * mm
HDR_RIGHT_W = 78.5 * mm

LOGO_MAX_W = 40 * mm
LOGO_MAX_H = 22 * mm

SUMMARY_CARD_WIDTHS = [52.3 * mm, 40.2 * mm, 36.2 * mm, 48.3 * mm]
SUMMARY_GAP = 3 * mm

TOTALS_W = 86 * mm

FOOTER_QR_W = 30 * mm
FOOTER_GAP = 5 * mm
ARCA_LOGO_W = 32 * mm
ARCA_LOGO_H = 11 * mm
FOOTER_ZONE_H = 55 * mm


def _get_setting(key: str, default: str = "") -> str:
    s = Setting.query.get(key)
    return s.value if s and s.value else default


def _format_money(val) -> str:
    """Formato es-AR: separador de miles '.', decimales con ','."""
    try:
        d = Decimal(str(val))
    except Exception:
        return f"$ {val}"
    s = f"{d:,.2f}"
    s = s.translate(str.maketrans({",": "\x00", ".": ","})).replace("\x00", ".")
    return f"$ {s}"


def _format_qty(val) -> str:
    """Cantidad con coma decimal es-AR."""
    try:
        d = Decimal(str(val))
    except Exception:
        return str(val)
    return f"{d:.2f}".replace(".", ",")


def _format_date(d) -> str:
    if not d:
        return "-"
    if isinstance(d, str):
        return d
    return d.strftime("%d/%m/%Y")


def _month_year_es(d) -> str:
    if not d:
        return "-"
    return f"{MESES_ES[d.month - 1].capitalize()} {d.year}"


def _build_afip_qr_url(invoice: Invoice, client: Client | None) -> str | None:
    """Arma la URL del QR de AFIP/ARCA para un comprobante autorizado, o None si no corresponde."""
    cbte_type = cbte_type_for(invoice.invoice_type)
    if not cbte_type or not invoice.cae:
        return None

    try:
        cae_num = int(str(invoice.cae).strip())
    except (TypeError, ValueError):
        return None

    doc_type, doc_number = client_doc_for_afip(client)
    moneda_afip = "PES" if (invoice.currency or "ARS").upper() == "ARS" else invoice.currency

    payload = {
        "ver": 1,
        "fecha": (invoice.issue_date or today_local()).strftime("%Y-%m-%d"),
        "cuit": int("".join(ch for ch in str(invoice.issuer_cuit) if ch.isdigit()) or 0),
        "ptoVta": int(invoice.point_of_sale),
        "tipoCmp": cbte_type,
        "nroCmp": int(invoice.cbte_number or 0),
        "importe": float(Decimal(str(invoice.total or 0))),
        "moneda": moneda_afip,
        "ctz": 1,
        "tipoDocRec": doc_type,
        "nroDocRec": doc_number,
        "tipoCodAut": "E",
        "codAut": cae_num,
    }
    encoded = base64.b64encode(json.dumps(payload).encode("utf-8")).decode("ascii")
    return f"{AFIP_QR_BASE_URL}{encoded}"


def _build_qr_image(url: str, size) -> Image:
    """Genera el PNG de un QR (negro puro sobre blanco) y lo envuelve en un flowable."""
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=1, box_size=8)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert("RGB")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return Image(buf, width=size, height=size)


def _fit_image(img_bytes: bytes, max_w, max_h) -> Image:
    """Imagen ajustada dentro de una caja de max_w×max_h sin deformarse."""
    img = Image(io.BytesIO(img_bytes))
    scale = min(max_w / img.imageWidth, max_h / img.imageHeight)
    img.drawWidth = img.imageWidth * scale
    img.drawHeight = img.imageHeight * scale
    return img


def _build_logo_flowable():
    """Devuelve el logo configurado en Ajustes, o el logo por defecto si no hay ninguno."""
    logo_b64 = _get_setting("issuer.logo_base64", "")
    img_bytes = None
    if logo_b64:
        try:
            raw = logo_b64.split(",", 1)[-1] if logo_b64.startswith("data:") else logo_b64
            img_bytes = base64.b64decode(raw)
        except Exception:
            img_bytes = None
    if img_bytes is None and os.path.exists(DEFAULT_LOGO_PATH):
        with open(DEFAULT_LOGO_PATH, "rb") as f:
            img_bytes = f.read()

    if img_bytes:
        try:
            return _fit_image(img_bytes, LOGO_MAX_W, LOGO_MAX_H)
        except Exception:
            pass
    return Spacer(LOGO_MAX_W, LOGO_MAX_H)


def _kv_table(rows, style_label, style_value, colon=True, bold_label=True):
    """Mini-tabla de pares etiqueta/valor, con la columna de etiqueta ajustada al texto más largo."""
    suffix = ":" if colon else ""
    label_font = FONT_BOLD if bold_label else style_label.fontName
    texts = [f"{label}{suffix}" for label, _ in rows]
    text_w = max(stringWidth(t, label_font, style_label.fontSize) for t in texts)
    gap = 3 * mm
    label_col_w = text_w + gap

    data = [
        [
            Paragraph(f"<b>{t}</b>" if bold_label else t, style_label),
            Paragraph(str(value), style_value),
        ]
        for t, (_, value) in zip(texts, rows)
    ]
    t = Table(data, colWidths=[label_col_w, None])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (0, -1), gap),
        ("RIGHTPADDING", (1, 0), (1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0.3 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0.3 * mm),
    ]))
    return t


def _col_width(header_text, header_style, row_texts, row_style, pad_h):
    """Ancho de columna ajustado al contenido más largo (encabezado o filas) + padding."""
    w = stringWidth(header_text, header_style.fontName, header_style.fontSize)
    for t in row_texts:
        if t:
            w = max(w, stringWidth(t, row_style.fontName, row_style.fontSize))
    return w + 2 * pad_h + 2


def _card(content, width, bg=COLOR_CARD_BG, radius=3 * mm,
          pad_v=3 * mm, pad_h=4 * mm, border=None):
    """Tarjeta rectangular con esquinas redondeadas y fondo sólido."""
    t = Table([[content]], colWidths=[width])
    style = [
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(bg)),
        ("ROUNDEDCORNERS", [radius, radius, radius, radius]),
        ("TOPPADDING", (0, 0), (-1, -1), pad_v),
        ("BOTTOMPADDING", (0, 0), (-1, -1), pad_v),
        ("LEFTPADDING", (0, 0), (-1, -1), pad_h),
        ("RIGHTPADDING", (0, 0), (-1, -1), pad_h),
    ]
    if border:
        style.append(("BOX", (0, 0), (-1, -1), border[0], colors.HexColor(border[1])))
    t.setStyle(TableStyle(style))
    return t


def _invoice_items(invoice: Invoice, plan, is_type_a: bool):
    """Arma los ítems a facturar (agrupados) con neto/IVA/bruto calculados.

    El desglose de neto/IVA se congela al emitir la factura (`invoice.net_amount`
    / `iva_amount` / `iva_percent`); si esos campos están vacíos (comprobantes
    emitidos antes de existir el congelado) se recalcula en vivo a partir del
    plan actual o del %IVA por defecto, como se hacía originalmente.
    """
    custom_desc = getattr(invoice, "description", None)
    total_gross = Decimal(str(invoice.total or 0))

    period_txt = ""
    if invoice.period_start and invoice.period_end:
        period_txt = f"{_format_date(invoice.period_start)} al {_format_date(invoice.period_end)}"

    frozen = invoice.net_amount is not None and invoice.iva_amount is not None and invoice.iva_percent is not None
    if frozen:
        net, iva_amt, pct = Decimal(str(invoice.net_amount)), Decimal(str(invoice.iva_amount)), Decimal(str(invoice.iva_percent))
    elif plan and not custom_desc:
        net, iva_amt, pct = plan.price_net, plan.iva_amount, plan.iva_percent
    else:
        iva_pct_default = Decimal(str(_get_setting("afip.iva_percent_default", "21") or "21"))
        divisor = Decimal("1") + (iva_pct_default / Decimal("100"))
        net = (total_gross / divisor).quantize(Decimal("0.01"))
        iva_amt = total_gross - net
        pct = iva_pct_default

    if plan and not custom_desc:
        desc = f"Servicio de internet - Plan {plan.name} ({plan.download_mbps}/{plan.upload_mbps} Mbps)"
        group_name, group_note = "Servicio de internet", period_txt
    elif custom_desc:
        desc = custom_desc
        group_name, group_note = "Servicios", ""
    else:
        desc = f"Servicio de internet{f' ({period_txt})' if period_txt else ''}"
        group_name, group_note = "Servicio de internet", period_txt

    item = {
        "desc": desc, "qty": Decimal("1"),
        "net": net, "pct": pct, "iva": iva_amt, "gross": total_gross,
    }
    return [{"group": group_name, "note": group_note, "items": [item]}]


def generate_invoice_pdf(invoice: Invoice) -> bytes:
    """Genera un PDF de la factura y lo retorna como bytes."""

    _ensure_fonts_registered()

    buf = io.BytesIO()
    page_w, page_h = A4

    main_frame = Frame(
        PAGE_MARGIN, PAGE_MARGIN + FOOTER_ZONE_H,
        page_w - 2 * PAGE_MARGIN, page_h - 2 * PAGE_MARGIN - FOOTER_ZONE_H,
        id="main", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
    )
    footer_frame = Frame(
        PAGE_MARGIN, PAGE_MARGIN,
        page_w - 2 * PAGE_MARGIN, FOOTER_ZONE_H,
        id="footer", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
    )
    doc = BaseDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=PAGE_MARGIN,
        rightMargin=PAGE_MARGIN,
        topMargin=PAGE_MARGIN,
        bottomMargin=PAGE_MARGIN,
    )
    doc.addPageTemplates([PageTemplate(id="Invoice", frames=[main_frame, footer_frame])])

    # Estilos.
    style_base = ParagraphStyle(
        "Base", fontName=FONT_REGULAR, fontSize=9.5, leading=9.5 * 1.35, textColor=colors.HexColor(COLOR_INK),
    )
    style_base_right = ParagraphStyle("BaseRight", parent=style_base, alignment=TA_RIGHT)
    style_tipo_letter = ParagraphStyle(
        "TipoLetter", fontName=FONT_BOLD, fontSize=28, leading=28,
        alignment=TA_CENTER, textColor=colors.HexColor(COLOR_INK),
    )
    style_cod = ParagraphStyle(
        "Cod", fontName=FONT_BOLD, fontSize=6.5, alignment=TA_CENTER, textColor=colors.HexColor(COLOR_INK),
    )
    style_factura_subtitle = ParagraphStyle(
        "FacturaSubtitle", fontName=FONT_REGULAR, fontSize=12, leading=12 * 1.1,
        alignment=TA_RIGHT, textColor=colors.HexColor(COLOR_INK),
    )
    style_label = ParagraphStyle(
        "Label", fontName=FONT_BOLD, fontSize=9.5, textColor=colors.HexColor(COLOR_INK),
    )
    style_value = ParagraphStyle(
        "Value", fontName=FONT_REGULAR, fontSize=9.5, textColor=colors.HexColor(COLOR_INK),
    )
    style_card_label = ParagraphStyle(
        "CardLabel", fontName=FONT_BOLD, fontSize=7, textColor=colors.HexColor(COLOR_SECONDARY),
    )
    style_card_label_white = ParagraphStyle(
        "CardLabelWhite", parent=style_card_label, textColor=colors.Color(1, 1, 1, alpha=0.85),
    )
    style_card_value = ParagraphStyle(
        "CardValue", fontName=FONT_BOLD, fontSize=11, textColor=colors.HexColor(COLOR_INK),
    )
    style_card_value_white = ParagraphStyle(
        "CardValueWhite", parent=style_card_value, textColor=colors.white,
    )
    style_period_dates = ParagraphStyle(
        "PeriodDates", fontName=FONT_REGULAR, fontSize=7, textColor=colors.HexColor(COLOR_SECONDARY),
    )
    style_importe_total_card_value = ParagraphStyle(
        "ImporteTotalCardValue", fontName=FONT_EXTRABOLD, fontSize=18, leading=18 * 1.1, textColor=colors.white,
    )
    style_section_title = ParagraphStyle(
        "SectionTitle", fontName=FONT_EXTRABOLD, fontSize=7.5, textColor=colors.HexColor(COLOR_INK),
    )
    style_table_header = ParagraphStyle(
        "TableHeader", fontName=FONT_BOLD, fontSize=9, textColor=colors.white,
    )
    style_table_header_right = ParagraphStyle(
        "TableHeaderRight", parent=style_table_header, alignment=TA_RIGHT,
    )
    style_table_row = ParagraphStyle(
        "TableRow", fontName=FONT_REGULAR, fontSize=9.5, textColor=colors.HexColor(COLOR_INK),
    )
    style_table_row_right = ParagraphStyle(
        "TableRowRight", parent=style_table_row, alignment=TA_RIGHT,
    )
    style_group_combo = ParagraphStyle(
        "GroupCombo", fontName=FONT_REGULAR, fontSize=7.5, textColor=colors.HexColor(COLOR_INK),
    )
    style_totals_label = ParagraphStyle(
        "TotalsLabel", fontName=FONT_REGULAR, fontSize=9.5, alignment=TA_LEFT, textColor=colors.HexColor(COLOR_INK),
    )
    style_totals_value = ParagraphStyle(
        "TotalsValue", fontName=FONT_REGULAR, fontSize=9.5, alignment=TA_RIGHT, textColor=colors.HexColor(COLOR_INK),
    )
    style_importe_total_label = ParagraphStyle(
        "ImporteTotalLabel", fontName=FONT_EXTRABOLD, fontSize=13, alignment=TA_LEFT, textColor=colors.HexColor(COLOR_INK),
    )
    style_importe_total_value = ParagraphStyle(
        "ImporteTotalValue", fontName=FONT_EXTRABOLD, fontSize=13, alignment=TA_RIGHT, textColor=colors.HexColor(COLOR_INK),
    )
    style_transparencia_title = ParagraphStyle(
        "TransparenciaTitle", fontName=FONT_BOLD, fontSize=7.5, textColor=colors.HexColor(COLOR_INK),
    )
    style_transparencia_row = ParagraphStyle(
        "TransparenciaRow", fontName=FONT_REGULAR, fontSize=8, alignment=TA_RIGHT, textColor=colors.HexColor(COLOR_INK),
    )
    style_transparencia_label = ParagraphStyle(
        "TransparenciaLabel", parent=style_transparencia_row, alignment=TA_LEFT,
    )
    style_comprobante_autorizado = ParagraphStyle(
        "ComprobanteAutorizado", fontName=FONT_BOLD, fontSize=9.5, textColor=colors.HexColor(COLOR_INK),
    )
    style_leyenda_legal = ParagraphStyle(
        "LeyendaLegal", fontName=FONT_REGULAR, fontSize=6.5, textColor=colors.HexColor(COLOR_SECONDARY),
    )
    style_cae = ParagraphStyle(
        "Cae", fontName=FONT_REGULAR, fontSize=10, alignment=TA_RIGHT, textColor=colors.HexColor(COLOR_INK),
    )
    style_pagina = ParagraphStyle(
        "Pagina", fontName=FONT_REGULAR, fontSize=8, alignment=TA_CENTER, textColor=colors.HexColor(COLOR_INK),
    )
    style_doc_footer = ParagraphStyle(
        "DocFooter", fontName=FONT_REGULAR, fontSize=7, textColor=colors.HexColor(COLOR_SECONDARY),
    )

    elements = []

    # Datos base del emisor y del comprobante.
    issuer_name = _get_setting("issuer.name", "Connect ISP")
    issuer_address = _get_setting("issuer.address", "[Domicilio comercial, Localidad, Provincia]")
    issuer_cuit = invoice.issuer_cuit or _get_setting("issuer.cuit", "")

    cbte_type = cbte_type_for(invoice.invoice_type)
    tipo_letter = (invoice.invoice_type or "X").upper()
    cod_txt = f"COD. {cbte_type:02d}" if cbte_type else ""
    tipo_word = "FACTURA" if invoice.invoice_type in ("A", "B", "C") else "COMPROBANTE"
    is_type_a = (invoice.invoice_type or "").upper() == "A"

    cbte_num = ""
    if invoice.cbte_number:
        pv = str(invoice.point_of_sale).zfill(5)
        num = str(invoice.cbte_number).zfill(8)
        cbte_num = f"{pv}-{num}"

    # Header: logo, datos del emisor, tipo de comprobante y datos de la factura.
    header_left = [
        _build_logo_flowable(),
        Spacer(1, 4 * mm),
        _kv_table(
            [
                ("Razón social", issuer_name),
                ("CUIT", issuer_cuit or "-"),
                ("Domicilio comercial", issuer_address),
            ],
            style_label=style_label,
            style_value=style_value,
        ),
    ]

    tipo_rows = [[Paragraph(tipo_letter, style_tipo_letter)]]
    if cod_txt:
        tipo_rows.append([Paragraph(cod_txt, style_cod)])
    tipo_box = Table(tipo_rows, colWidths=[HDR_MID_W])
    tipo_box_style = [
        ("BOX", (0, 0), (-1, -1), 1.5, colors.HexColor(COLOR_INK)),
        ("ROUNDEDCORNERS", [2 * mm, 2 * mm, 2 * mm, 2 * mm]),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, 0), 1.5 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 0.5 * mm if cod_txt else 1 * mm),
    ]
    if cod_txt:
        tipo_box_style += [
            ("TOPPADDING", (0, 1), (-1, 1), 0),
            ("BOTTOMPADDING", (0, 1), (-1, 1), 1 * mm),
        ]
    tipo_box.setStyle(TableStyle(tipo_box_style))

    header_right = [
        Spacer(1, 26 * mm),
        Paragraph(f"{tipo_word} {tipo_letter}", style_factura_subtitle),
        Spacer(1, 1 * mm),
        Paragraph("ORIGINAL", style_base_right),
    ]
    if cbte_num:
        header_right.append(Paragraph(f"N° {cbte_num}", style_base_right))
    header_right.append(Paragraph(
        f"Fecha de emisión: {_format_date(invoice.issue_date)}", style_base_right,
    ))

    header_table = Table(
        [[header_left, "", tipo_box, "", header_right]],
        colWidths=[HDR_LEFT_W, HDR_GAP, HDR_MID_W, HDR_GAP, HDR_RIGHT_W],
    )
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (2, 0), (2, 0), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    elements.append(header_table)

    client = Client.query.get(invoice.client_id)
    total_val = Decimal(str(invoice.total or 0))

    connection = Connection.query.get(invoice.connection_id) if invoice.connection_id else None
    plan = None
    if connection:
        plan = Plan.query.filter_by(profile=connection.plan_profile).first()

    # Resumen: 4 tarjetas.
    has_period = bool(invoice.period_start and invoice.period_end)
    period_month = _month_year_es(invoice.period_start or invoice.issue_date)
    period_content = [Paragraph(period_month, style_card_value)]
    if has_period:
        period_dates = f"{_format_date(invoice.period_start)} al {_format_date(invoice.period_end)}"
        period_content += [Spacer(1, 0.3 * mm), Paragraph(period_dates, style_period_dates)]

    summary_cards = [
        _card(
            [Paragraph("IMPORTE TOTAL", style_card_label_white), Spacer(1, 0.8 * mm),
             Paragraph(_format_money(total_val), style_importe_total_card_value)],
            SUMMARY_CARD_WIDTHS[0], bg=COLOR_INK,
        ),
        _card(
            [Paragraph("VENCIMIENTO", style_card_label), Spacer(1, 0.8 * mm),
             Paragraph(_format_date(invoice.due_date), style_card_value)],
            SUMMARY_CARD_WIDTHS[1],
        ),
        _card(
            [Paragraph("N° DE CLIENTE", style_card_label), Spacer(1, 0.8 * mm),
             Paragraph(f"{invoice.client_id:06d}", style_card_value)],
            SUMMARY_CARD_WIDTHS[2],
        ),
        _card(
            [Paragraph("PERÍODO", style_card_label), Spacer(1, 0.8 * mm)] + period_content,
            SUMMARY_CARD_WIDTHS[3],
        ),
    ]
    summary_row = [[]]
    for i, c in enumerate(summary_cards):
        summary_row[0].append(c)
        if i < len(summary_cards) - 1:
            summary_row[0].append("")
    summary_table = Table(summary_row, colWidths=[
        w for pair in zip(SUMMARY_CARD_WIDTHS, [SUMMARY_GAP] * 4) for w in pair
    ][:-1])
    summary_table.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    elements.append(Spacer(1, 5 * mm))
    elements.append(summary_table)

    # Detalle de cliente (tarjeta única, ancho completo, 2 columnas).
    if client and client.cuit:
        doc_label, doc_value = "CUIT", client.cuit
    elif client and client.dni:
        doc_label, doc_value = "DNI", client.dni
    else:
        doc_label, doc_value = "DNI", "-"

    name_label = "Razón social" if is_type_a else "Nombre"

    client_rows_left = [
        (doc_label, doc_value),
        (name_label, client.full_name if client else f"Cliente #{invoice.client_id}"),
        ("Domicilio", (client.address if client and client.address else "-")),
    ]
    client_rows_right = [
        ("Condición frente al IVA", client_iva_condition_label(client, invoice.invoice_type)),
    ]
    if plan:
        client_rows_right.append(("Plan", plan.name))
    elif getattr(invoice, "description", None):
        client_rows_right.append(("Concepto", invoice.description))

    client_inner = Table(
        [[
            _kv_table(client_rows_left, style_label=style_label, style_value=style_value),
            _kv_table(client_rows_right, style_label=style_label, style_value=style_value),
        ]],
        colWidths=[(CONTENT_W - 2 * 4 * mm - 6 * mm) / 2, (CONTENT_W - 2 * 4 * mm - 6 * mm) / 2],
    )
    client_inner.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (0, 0), 6 * mm),
        ("RIGHTPADDING", (1, 0), (1, 0), 0),
    ]))

    client_card = _card(
        [
            Paragraph("DETALLE DE CLIENTE", style_section_title),
            Spacer(1, 2 * mm),
            client_inner,
        ],
        CONTENT_W,
    )
    elements.append(Spacer(1, 3 * mm))
    elements.append(client_card)

    # Detalle de ítems facturados, agrupados.
    elements.append(Spacer(1, 5 * mm))

    groups = _invoice_items(invoice, plan, is_type_a)
    price_key = "net" if is_type_a else "gross"

    flat_rows_text = []
    for g in groups:
        for it in g["items"]:
            flat_rows_text.append([
                _format_qty(it["qty"]), _format_money(it[price_key]), _format_money(it[price_key]),
            ])

    header_texts = ["Cant.", "Precio unit.", "Subtotal"]
    col_widths = [None] + [
        _col_width(header_texts[i], style_table_header_right,
                   [r[i] for r in flat_rows_text], style_table_row_right, 2 * mm)
        for i in range(3)
    ]

    detail_rows = [[
        Paragraph("Producto / servicio", style_table_header),
        Paragraph("Cant.", style_table_header_right),
        Paragraph("Precio unit.", style_table_header_right),
        Paragraph("Subtotal", style_table_header_right),
    ]]
    row_styles = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(COLOR_INK)),
        ("ROUNDEDCORNERS", [2 * mm, 2 * mm, 0, 0]),
    ]
    for g in groups:
        row_idx = len(detail_rows)
        combo = (
            f'<font color="{COLOR_ACCENT}"><b>{g["group"].upper()}</b></font>'
            + (f'&nbsp;&nbsp;&nbsp;<font color="{COLOR_INK}">{g["note"]}</font>' if g["note"] else "")
        )
        detail_rows.append([Paragraph(combo, style_group_combo), "", "", ""])
        row_styles.append(("SPAN", (0, row_idx), (-1, row_idx)))
        row_styles.append(("TOPPADDING", (0, row_idx), (-1, row_idx), 3.5 * mm))
        row_styles.append(("BOTTOMPADDING", (0, row_idx), (-1, row_idx), 1 * mm))
        for it, rt in zip(g["items"], flat_rows_text):
            item_idx = len(detail_rows)
            detail_rows.append([
                Paragraph(it["desc"], style_table_row),
                Paragraph(rt[0], style_table_row_right),
                Paragraph(rt[1], style_table_row_right),
                Paragraph(rt[2], style_table_row_right),
            ])
            row_styles.append(("LINEBELOW", (0, item_idx), (-1, item_idx), 0.5, colors.HexColor(COLOR_LINE)))

    detail_table = Table(detail_rows, colWidths=col_widths)
    detail_table.setStyle(TableStyle(row_styles + [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, 0), 2 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 2 * mm),
        ("LEFTPADDING", (0, 0), (-1, -1), 2 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2 * mm),
    ]))
    elements.append(detail_table)

    # Totales, alineados a la derecha.
    totals_rows = [
        [Paragraph("Subtotal", style_totals_label), Paragraph(_format_money(total_val), style_totals_value)],
        [Paragraph("Importe total", style_importe_total_label), Paragraph(_format_money(total_val), style_importe_total_value)],
    ]
    totals_table = Table(totals_rows, colWidths=[None, 32 * mm])
    totals_table.setStyle(TableStyle([
        ("TOPPADDING", (0, 0), (-1, -1), 1 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1 * mm),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))

    totals_content = [totals_table]

    if not is_type_a and cbte_type:
        iva_contenido = groups[0]["items"][0]["iva"]
        totals_content.append(Spacer(1, 3 * mm))
        totals_content.append(Paragraph(
            "Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)", style_transparencia_title,
        ))
        totals_content.append(Spacer(1, 0.8 * mm))
        iva_row = Table(
            [[Paragraph("IVA contenido", style_transparencia_label), Paragraph(_format_money(iva_contenido), style_transparencia_row)]],
            colWidths=[None, 32 * mm],
        )
        iva_row.setStyle(TableStyle([
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))
        totals_content.append(iva_row)

    totals_card = _card(
        totals_content, TOTALS_W,
        bg="#FFFFFF", border=(0.5, COLOR_ACCENT), pad_v=2 * mm, pad_h=4 * mm,
    )

    totals_wrapper = Table([["", totals_card]], colWidths=[CONTENT_W - TOTALS_W, TOTALS_W])
    totals_wrapper.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    elements.append(Spacer(1, 4 * mm))
    elements.append(totals_wrapper)

    # Observaciones.
    invoice_notes = getattr(invoice, "notes", None)
    if invoice_notes:
        elements.append(Spacer(1, 4 * mm))
        elements.append(Paragraph("OBSERVACIONES", style_section_title))
        elements.append(Spacer(1, 2 * mm))
        elements.append(Paragraph(str(invoice_notes), style_base))

    # Pie de ARCA (frame fijo al fondo de la página).
    elements.append(FrameBreak())
    elements.append(Spacer(1, 2.5 * mm))
    elements.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor(COLOR_LINE)))
    elements.append(Spacer(1, 3.5 * mm))

    qr_url = _build_afip_qr_url(invoice, client)
    if qr_url:
        if os.path.exists(ARCA_LOGO_PATH):
            with open(ARCA_LOGO_PATH, "rb") as f:
                arca_box = _fit_image(f.read(), ARCA_LOGO_W, ARCA_LOGO_H)
        else:
            arca_box = Paragraph("ARCA", ParagraphStyle(
                "Arca", fontName=FONT_EXTRABOLD, fontSize=15, leading=18, textColor=colors.HexColor(COLOR_INK),
            ))
        footer_texts = [
            arca_box,
            Spacer(1, 1 * mm),
            Paragraph("Comprobante autorizado", style_comprobante_autorizado),
            Paragraph(
                "Esta Agencia no se responsabiliza por los datos ingresados "
                "en el detalle de la operación",
                style_leyenda_legal,
            ),
        ]
        footer_cae = Paragraph(
            f"<b>CAE N°:</b> {invoice.cae}<br/>"
            f"<b>Fecha de vto. de CAE:</b> {_format_date(invoice.cae_due_date)}",
            style_cae,
        )
        footer_table = Table(
            [[_build_qr_image(qr_url, FOOTER_QR_W), "", footer_texts, "", footer_cae]],
            colWidths=[FOOTER_QR_W, FOOTER_GAP, None, FOOTER_GAP, None],
        )
        footer_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ]))
        elements.append(footer_table)
    else:
        elements.append(Paragraph("Comprobante no válido como factura", style_leyenda_legal))

    elements.append(Spacer(1, 2 * mm))
    elements.append(Paragraph("Pág. 1/1", style_pagina))
    elements.append(Spacer(1, 2 * mm))
    elements.append(Paragraph(
        f"Documento generado el {_format_date(today_local())} — {issuer_name}",
        style_doc_footer,
    ))

    doc.build(elements)
    return buf.getvalue()
