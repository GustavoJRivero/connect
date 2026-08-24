from ..extensions import db
from ..models.client_portal import ClientNotification
from ..models.invoice import Invoice


def notify_client(*, client_id: int, kind: str, title: str, body: str | None = None, invoice_id: int | None = None) -> ClientNotification:
    n = ClientNotification(
        client_id=int(client_id),
        kind=kind,
        title=title[:160],
        body=(body or "")[:500] or None,
        invoice_id=invoice_id,
    )
    db.session.add(n)
    return n


def notify_invoice_issued(invoice: Invoice) -> None:
    if not invoice or not invoice.client_id or invoice.status != "ISSUED":
        return
    exists = (
        ClientNotification.query.filter_by(invoice_id=invoice.id, kind="INVOICE")
        .first()
    )
    if exists:
        return
    total = invoice.total
    due = invoice.due_date.isoformat() if invoice.due_date else None
    body = f"Factura #{invoice.id} por ${total}."
    if due:
        body += f" Vence el {due}."
    notify_client(
        client_id=int(invoice.client_id),
        kind="INVOICE",
        title="Nueva factura",
        body=body,
        invoice_id=int(invoice.id),
    )


def notify_payment(*, client_id: int, invoice_id: int | None, amount) -> None:
    body = f"Registramos un pago de ${amount}."
    if invoice_id:
        body += f" Factura #{invoice_id}."
    notify_client(
        client_id=int(client_id),
        kind="PAYMENT",
        title="Pago acreditado",
        body=body,
        invoice_id=invoice_id,
    )
