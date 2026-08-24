from decimal import Decimal
from datetime import timedelta

from ..extensions import db
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
