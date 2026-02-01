import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Button, Field } from "../ui";

type PaymentMethod = "TRANSFER" | "MERCADOPAGO" | "CASH" | "CARD";

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "TRANSFER", label: "Transferencia bancaria" },
  { value: "MERCADOPAGO", label: "MercadoPago" },
  { value: "CASH", label: "Efectivo" },
  { value: "CARD", label: "Tarjeta de Crédito/Débito" },
];

export function PaymentModal(props: {
  open: boolean;
  invoice: any | null;
  onClose: () => void;
  onSaved: (payment: any) => void;
}) {
  const inv = props.invoice;

  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [amount, setAmount] = useState<string>("");
  const [reference, setReference] = useState<string>("");
  const [paidAt, setPaidAt] = useState<string>(new Date().toISOString().slice(0, 10));

  const remaining = useMemo(() => {
    const t = Number(inv?.total ?? 0);
    const p = Number(inv?.paid_total ?? 0);
    return Math.max(0, t - p);
  }, [inv]);

  useEffect(() => {
    if (!props.open) return;
    setError(null);
    setMethod("CASH");
    setReference("");
    setPaidAt(new Date().toISOString().slice(0, 10));
    if (inv) setAmount(String(remaining ? remaining.toFixed(2) : Number(inv?.total ?? 0).toFixed(2)));
    else setAmount("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, inv?.id]);

  useEffect(() => {
    if (!props.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.classList.add("modal-open");
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("modal-open");
      document.body.style.overflow = "";
    };
  }, [props.open, props.onClose]);

  async function save() {
    setError(null);
    if (!inv) return;
    if (!amount || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
      setError("Ingresá un monto válido.");
      return;
    }
    try {
      const payment = await api.createPayment({
        client_id: Number(inv.client_id),
        amount,
        method,
        reference: reference || null,
        paid_at: paidAt || null,
        invoice_ids: [Number(inv.id)],
      });
      props.onSaved(payment);
    } catch (e: any) {
      setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`);
    }
  }

  if (!props.open) return null;

  return (
    <>
      <div
        className="modal fade show"
        style={{ display: "block" }}
        tabIndex={-1}
        role="dialog"
        onMouseDown={(e) => {
          // click en backdrop
          if (e.target === e.currentTarget) props.onClose();
        }}
      >
        <div className="modal-dialog modal-lg" role="document">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">
                Registrar pago {inv ? `— Factura #${inv.id} (Cliente ${inv.client_id})` : ""}
              </h5>
              <button type="button" className="btn-close" aria-label="Close" onClick={props.onClose} />
            </div>
            <div className="modal-body">
              {error ? <div className="alert alert-danger sc-error">{error}</div> : null}
              {inv ? (
                <>
                  <div className="row">
                    <div className="col-md-5">
                      <div className="mb-3">
                        <label className="form-label">Medio de pago</label>
                        <select className="form-select" value={method} onChange={(e) => setMethod(e.target.value as any)}>
                          {PAYMENT_METHODS.map((m) => (
                            <option key={m.value} value={m.value}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="col-md-3">
                      <Field label="Monto" value={amount} onChange={setAmount} />
                      <div className="form-text">Saldo: AR$ {remaining.toFixed(2)}</div>
                    </div>
                    <div className="col-md-4">
                      <div className="mb-3">
                        <label className="form-label">Fecha</label>
                        <input type="date" className="form-control" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
                      </div>
                    </div>
                  </div>

                  <Field label="Referencia (op/comprobante)" value={reference} onChange={setReference} placeholder="Opcional" />
                </>
              ) : (
                <div className="text-muted">Seleccioná una factura.</div>
              )}
            </div>
            <div className="modal-footer">
              <Button variant="default" onClick={props.onClose}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={save}>
                Registrar
              </Button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" />
    </>
  );
}

