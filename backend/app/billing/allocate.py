from decimal import Decimal
from datetime import timedelta

from ..extensions import db
from ..models.client import Client
from ..models.client_credit import ClientCreditMovement
from ..models.invoice import Invoice
from ..models.payment import Payment, PaymentAllocation
from ..models.setting import Setting
from ..timezone import today_local


def _invoice_balance(x: Invoice) -> Decimal:
    return Decimal(str(x.total)) - Decimal(str(x.paid_total))


def _get_setting(key: str, default=None):
    s = Setting.query.get(key)
    return s.value if s else default


def _next_cbte_number(*, point_of_sale: int, invoice_type: str) -> int:
    key = f"invoice.next.{point_of_sale}.{invoice_type}"
    current = int(_get_setting(key, "1"))
    db.session.merge(Setting(key=key, value=str(current + 1)))
    return current


def apply_client_credit(client_id: int, invoice: Invoice | None = None) -> Decimal:
    """
    Aplica el saldo a favor del cliente a facturas ISSUED con saldo pendiente
    (a `invoice` si se pasa, o a todas por orden FIFO). No hace commit.
    Devuelve el total aplicado.
    """
    client = Client.query.get(client_id)
    if not client or Decimal(str(client.credit_balance or 0)) <= 0:
        return Decimal("0")

    invoices = [invoice] if invoice else (
        Invoice.query.filter_by(client_id=client_id)
        .filter(Invoice.status == "ISSUED")
        .order_by(Invoice.issue_date.asc(), Invoice.id.asc())
        .all()
    )

    remaining = Decimal(str(client.credit_balance))
    total_applied = Decimal("0")
    for inv in invoices:
        if remaining <= 0 or inv.status != "ISSUED":
            break
        bal = _invoice_balance(inv)
        if bal <= 0:
            continue
        applied = remaining if remaining <= bal else bal
        inv.paid_total = Decimal(str(inv.paid_total)) + applied
        remaining -= applied
        total_applied += applied
        db.session.add(ClientCreditMovement(
            client_id=client_id, amount=-applied, reason="APPLIED_TO_INVOICE", invoice_id=inv.id,
        ))
        if _invoice_balance(inv) <= 0:
            inv.status = "PAID"

    client.credit_balance = remaining
    return total_applied


def allocate_payment(p: Payment, invoice_ids: list[int] | None = None) -> None:
    """Imputa un pago a facturas ISSUED. No hace commit."""
    remaining = Decimal(str(p.amount))
    invoices: list[Invoice] = []
    if invoice_ids:
        found = (
            Invoice.query.filter(Invoice.id.in_(invoice_ids))
            .filter(Invoice.client_id == int(p.client_id))
            .filter(Invoice.is_deleted.is_(False))
            .all()
        )
        found_map = {int(x.id): x for x in found}
        invoices = [found_map[i] for i in invoice_ids if i in found_map]
    else:
        invoices = (
            Invoice.query.filter_by(client_id=int(p.client_id))
            .filter(Invoice.status.in_(["ISSUED"]))
            .order_by(Invoice.issue_date.asc(), Invoice.id.asc())
            .all()
        )

    for inv in invoices:
        if remaining <= 0:
            break
        if inv.status == "DRAFT":
            inv.cbte_number = inv.cbte_number or _next_cbte_number(
                point_of_sale=int(inv.point_of_sale),
                invoice_type=str(inv.invoice_type),
            )
            inv.status = "ISSUED"
            if not inv.due_date:
                due_days = int(_get_setting("billing.due_days", "10"))
                inv.due_date = today_local() + timedelta(days=due_days)
        if inv.status != "ISSUED":
            continue
        bal = _invoice_balance(inv)
        if bal <= 0:
            continue
        applied = remaining if remaining <= bal else bal
        inv.paid_total = Decimal(str(inv.paid_total)) + applied
        remaining -= applied
        db.session.add(PaymentAllocation(payment_id=p.id, invoice_id=inv.id, amount=applied))
        if _invoice_balance(inv) <= 0:
            inv.status = "PAID"

    if remaining > 0:
        client = Client.query.get(int(p.client_id))
        if client:
            client.credit_balance = Decimal(str(client.credit_balance or 0)) + remaining
            db.session.add(ClientCreditMovement(
                client_id=client.id, amount=remaining, reason="PAYMENT_EXCESS", payment_id=p.id,
            ))
