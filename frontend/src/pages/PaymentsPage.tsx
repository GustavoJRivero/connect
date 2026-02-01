import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Button, Card, Field } from "../ui";

type PaymentMethod = "TRANSFER" | "MERCADOPAGO" | "CASH" | "CARD";

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "TRANSFER", label: "Transferencia bancaria" },
  { value: "MERCADOPAGO", label: "MercadoPago" },
  { value: "CASH", label: "Efectivo" },
  { value: "CARD", label: "Tarjeta de Crédito/Débito" },
];

export default function PaymentsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [clientId, setClientId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [paidAt, setPaidAt] = useState<string>(new Date().toISOString().slice(0, 10));

  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  async function reload() {
    setError(null);
    try {
      const res = await api.listPayments(clientId ? Number(clientId) : undefined, {
        from: from || undefined,
        to: to || undefined,
      });
      setItems(res);
    } catch (e: any) {
      setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create() {
    setError(null);
    try {
      await api.createPayment({
        client_id: Number(clientId),
        amount,
        method,
        reference: reference || null,
        note: note || null,
        paid_at: paidAt || null,
      });
      setAmount("");
      setReference("");
      setNote("");
      await reload();
    } catch (e: any) {
      setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`);
    }
  }

  return (
    <div className="row">
      <div className="col-12">
        <Card
          className="card card-outline card-primary"
          title="Registrar pago"
          headerRight={
            <>
              <Button variant="primary" onClick={create}>
                <i className="fa-solid fa-plus me-2" />
                Registrar
              </Button>
              <Button variant="default" onClick={reload}>
                <i className="fa-solid fa-rotate me-2" />
                Recargar
              </Button>
            </>
          }
        >
          <div className="row">
            <div className="col-md-3">
              <Field label="Client ID" value={clientId} onChange={setClientId} />
            </div>
            <div className="col-md-3">
              <Field label="Monto" value={amount} onChange={setAmount} />
            </div>
            <div className="col-md-3">
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
              <Field label="Referencia" value={reference} onChange={setReference} />
            </div>
          </div>
          <div className="row">
            <div className="col-md-3">
              <div className="mb-3">
                <label className="form-label">Fecha</label>
                <input type="date" className="form-control" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
              </div>
            </div>
            <div className="col-md-9">
              <Field label="Nota" value={note} onChange={setNote} placeholder="Opcional" />
            </div>
          </div>
          {error ? <div className="alert alert-danger sc-error mb-0">{error}</div> : null}
        </Card>
      </div>

      <div className="col-lg-8">
        <Card className="card card-outline card-secondary" title="Listado">
          <div className="row g-2 mb-3">
            <div className="col-md-4">
              <div className="mb-0">
                <label className="form-label">Desde</label>
                <input type="date" className="form-control" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
            </div>
            <div className="col-md-4">
              <div className="mb-0">
                <label className="form-label">Hasta</label>
                <input type="date" className="form-control" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>
            <div className="col-md-4 d-flex align-items-end gap-2">
              <Button
                variant="default"
                onClick={() => {
                  const d = new Date().toISOString().slice(0, 10);
                  setFrom(d);
                  setTo(d);
                }}
              >
                Hoy
              </Button>
              <Button
                variant="default"
                onClick={() => {
                  const now = new Date();
                  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
                  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
                  setFrom(start);
                  setTo(end);
                }}
              >
                Este mes
              </Button>
              <Button
                variant="default"
                onClick={() => {
                  const now = new Date();
                  const start = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
                  const end = new Date(now.getFullYear(), 11, 31).toISOString().slice(0, 10);
                  setFrom(start);
                  setTo(end);
                }}
              >
                Este año
              </Button>
              <Button
                variant="default"
                onClick={() => {
                  setFrom("");
                  setTo("");
                }}
              >
                Limpiar
              </Button>
            </div>
          </div>

          <div className="table-responsive">
            <table className="table table-bordered table-hover">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Usuario</th>
                  <th>Monto</th>
                  <th>Medio</th>
                  <th>Facturas</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <td>#{p.id}</td>
                    <td>{p.paid_at ?? "-"}</td>
                    <td>{p.client_id}</td>
                    <td>{p.created_by?.username ?? "-"}</td>
                    <td>{p.amount}</td>
                    <td>{p.method ?? "-"}</td>
                    <td>{(p.allocations ?? []).map((a: any) => `#${a.invoice_id}`).join(", ") || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

