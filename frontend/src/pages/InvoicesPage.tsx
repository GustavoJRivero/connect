import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Button, Card, Field } from "../ui";
import { InvoiceModal } from "../components/InvoiceModal";
import { PaymentModal } from "../components/PaymentModal";

export default function InvoicesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [paying, setPaying] = useState<any | null>(null);
  const [showNewInvoice, setShowNewInvoice] = useState(false);

  async function reload() {
    setError(null);
    try {
      const res = await api.listInvoices();
      setItems(res);
    } catch (e: any) {
      setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function issue(id: number) {
    setError(null);
    try {
      await api.issueInvoice(id);
      await reload();
    } catch (e: any) {
      setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`);
    }
  }

  async function removeInvoice(id: number) {
    setError(null);
    try {
      if (!window.confirm("¿Eliminar factura? (baja lógica, solo si no tiene pagos)")) return;
      await api.deleteInvoice(id);
      if (paying?.id === id) setPaying(null);
      await reload();
    } catch (e: any) {
      setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`);
    }
  }

  function openPay(x: any) {
    setError(null);
    setPaying(x);
  }

  return (
    <div className="row">
      <InvoiceModal
        open={showNewInvoice}
        onClose={() => setShowNewInvoice(false)}
        onSaved={async () => {
          setShowNewInvoice(false);
          await reload();
        }}
      />

      <PaymentModal
        open={!!paying}
        invoice={paying}
        onClose={() => setPaying(null)}
        onSaved={async () => {
          setPaying(null);
          await reload();
        }}
      />

      <div className="col-12">
        <Card
          className="card card-outline card-primary"
          title="Facturas"
          headerRight={
            <>
              <Button
                variant="primary"
                onClick={() => {
                  setShowNewInvoice(true);
                  setError(null);
                }}
              >
                <i className="fa-solid fa-plus me-2" />
                Nueva factura
              </Button>
              <Button variant="default" onClick={reload}>
                <i className="fa-solid fa-rotate me-2" />
                Recargar
              </Button>
            </>
          }
        >
          {error ? <div className="alert alert-danger sc-error mb-0">{error}</div> : null}
        </Card>
      </div>

      <div className="col-lg-8">
        <Card className="card card-outline card-secondary" title="Listado">
          <div className="table-responsive">
            <table className="table table-bordered table-hover">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Tipo</th>
                  <th>PV</th>
                  <th>N°</th>
                  <th>Cliente</th>
                  <th>Conexión</th>
                  <th>Total</th>
                  <th>Pagado</th>
                  <th>Vence</th>
                  <th>Estado</th>
                  <th style={{ width: 240 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.map((x) => (
                  <tr key={x.id}>
                    <td>#{x.id}</td>
                    <td>{x.invoice_type}</td>
                    <td>{x.point_of_sale}</td>
                    <td>{x.cbte_number ?? "-"}</td>
                    <td>{x.client_id}</td>
                    <td>{x.connection_id ?? "-"}</td>
                    <td>{x.total}</td>
                    <td>{x.paid_total ?? "0"}</td>
                    <td>{x.due_date ?? "-"}</td>
                    <td>{x.status}</td>
                    <td>
                      {x.status === "DRAFT" ? (
                        <Button variant="primary" onClick={() => issue(x.id)}>
                          Emitir
                        </Button>
                      ) : null}
                      {x.status === "ISSUED" || x.status === "DRAFT" ? (
                        <Button variant="primary" onClick={() => openPay(x)}>
                          Registrar pago
                        </Button>
                      ) : null}
                      <Button variant="danger" onClick={() => removeInvoice(x.id)}>
                        Eliminar
                      </Button>
                    </td>
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

