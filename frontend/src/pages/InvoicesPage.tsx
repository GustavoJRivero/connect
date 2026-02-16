import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Button, Card } from "../ui";
import { InvoiceModal } from "../components/InvoiceModal";
import { PaymentModal } from "../components/PaymentModal";
import { Grid, Table, Alert } from "@mantine/core";

export default function InvoicesPage() {
  const [items, setItems] = useState<unknown[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState<unknown>(null);
  const [showNewInvoice, setShowNewInvoice] = useState(false);

  async function reload() {
    setError(null);
    try {
      const res = await api.listInvoices();
      setItems(Array.isArray(res) ? res : []);
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
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
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    }
  }

  async function removeInvoice(id: number) {
    setError(null);
    try {
      if (!window.confirm("¿Eliminar factura? (baja lógica, solo si no tiene pagos)")) return;
      await api.deleteInvoice(id);
      if (paying && typeof paying === "object" && "id" in paying && (paying as { id: number }).id === id) setPaying(null);
      await reload();
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    }
  }

  const list = items as { id: number; invoice_type?: string; point_of_sale?: number; cbte_number?: string; client_id: number; connection_id?: number; total: string; paid_total?: string; due_date?: string; status: string }[];

  return (
    <Grid>
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

      <Grid.Col span={12}>
        <Card
          title="Facturas"
          headerRight={
            <>
              <Button variant="primary" onClick={() => { setShowNewInvoice(true); setError(null); }}>
                Nueva factura
              </Button>
              <Button variant="default" onClick={reload}>
                Recargar
              </Button>
            </>
          }
        >
          {error ? <Alert color="red" className="sc-error mb-0">{error}</Alert> : null}
        </Card>
      </Grid.Col>

      <Grid.Col span={{ base: 12, lg: 8 }}>
        <Card title="Listado">
          <Table.ScrollContainer minWidth={800}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>ID</Table.Th>
                  <Table.Th>Tipo</Table.Th>
                  <Table.Th>PV</Table.Th>
                  <Table.Th>N°</Table.Th>
                  <Table.Th>Cliente</Table.Th>
                  <Table.Th>Conexión</Table.Th>
                  <Table.Th>Total</Table.Th>
                  <Table.Th>Pagado</Table.Th>
                  <Table.Th>Vence</Table.Th>
                  <Table.Th>Estado</Table.Th>
                  <Table.Th>Acciones</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {list.map((x) => (
                  <Table.Tr key={x.id}>
                    <Table.Td>#{x.id}</Table.Td>
                    <Table.Td>{x.invoice_type}</Table.Td>
                    <Table.Td>{x.point_of_sale}</Table.Td>
                    <Table.Td>{x.cbte_number ?? "-"}</Table.Td>
                    <Table.Td>{x.client_id}</Table.Td>
                    <Table.Td>{x.connection_id ?? "-"}</Table.Td>
                    <Table.Td>{x.total}</Table.Td>
                    <Table.Td>{x.paid_total ?? "0"}</Table.Td>
                    <Table.Td>{x.due_date ?? "-"}</Table.Td>
                    <Table.Td>{x.status}</Table.Td>
                    <Table.Td>
                      {x.status === "DRAFT" ? (
                        <Button variant="primary" onClick={() => issue(x.id)}>Emitir</Button>
                      ) : null}
                      {(x.status === "ISSUED" || x.status === "DRAFT") ? (
                        <Button variant="primary" onClick={() => setPaying(x)}>Registrar pago</Button>
                      ) : null}
                      <Button variant="danger" onClick={() => removeInvoice(x.id)}>Eliminar</Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      </Grid.Col>
    </Grid>
  );
}
