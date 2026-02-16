import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Button, Card, Field } from "../ui";
import { Grid, Table, Select, Alert } from "@mantine/core";

type PaymentMethod = "TRANSFER" | "MERCADOPAGO" | "CASH" | "CARD";

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "TRANSFER", label: "Transferencia bancaria" },
  { value: "MERCADOPAGO", label: "MercadoPago" },
  { value: "CASH", label: "Efectivo" },
  { value: "CARD", label: "Tarjeta de Crédito/Débito" },
];

export default function PaymentsPage() {
  const [items, setItems] = useState<unknown[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [paidAt, setPaidAt] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  async function reload() {
    setError(null);
    try {
      const res = await api.listPayments(clientId ? Number(clientId) : undefined, { from: from || undefined, to: to || undefined });
      setItems(Array.isArray(res) ? res : []);
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    }
  }

  useEffect(() => {
    reload();
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
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    }
  }

  const list = items as { id: number; paid_at?: string; client_id: number; created_by?: { username: string }; amount: string; method?: string; allocations?: { invoice_id: number }[] }[];

  return (
    <Grid>
      <Grid.Col span={12}>
        <Card
          title="Registrar pago"
          headerRight={
            <>
              <Button variant="primary" onClick={create}>Registrar</Button>
              <Button variant="default" onClick={reload}>Recargar</Button>
            </>
          }
        >
          <Grid>
            <Grid.Col span={{ base: 12, md: 3 }}>
              <Field label="Client ID" value={clientId} onChange={setClientId} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 3 }}>
              <Field label="Monto" value={amount} onChange={setAmount} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 3 }}>
              <Select
                label="Medio de pago"
                value={method}
                onChange={(v) => v && setMethod(v as PaymentMethod)}
                data={PAYMENT_METHODS.map((m) => ({ value: m.value, label: m.label }))}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 3 }}>
              <Field label="Referencia" value={reference} onChange={setReference} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 3 }}>
              <label style={{ fontSize: "var(--mantine-font-size-sm)", fontWeight: 500 }}>Fecha</label>
              <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} style={{ width: "100%", padding: "var(--mantine-spacing-xs) var(--mantine-spacing-sm)", border: "1px solid var(--mantine-color-default-border)", borderRadius: "var(--mantine-radius-sm)" }} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 9 }}>
              <Field label="Nota" value={note} onChange={setNote} placeholder="Opcional" />
            </Grid.Col>
          </Grid>
          {error ? <Alert color="red" className="sc-error" mt="sm">{error}</Alert> : null}
        </Card>
      </Grid.Col>

      <Grid.Col span={{ base: 12, lg: 8 }}>
        <Card title="Listado">
          <Grid mb="md">
            <Grid.Col span={{ base: 12, md: 4 }}>
              <label style={{ fontSize: "var(--mantine-font-size-sm)" }}>Desde</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: "100%", padding: "var(--mantine-spacing-xs) var(--mantine-spacing-sm)", border: "1px solid var(--mantine-color-default-border)", borderRadius: "var(--mantine-radius-sm)" }} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 4 }}>
              <label style={{ fontSize: "var(--mantine-font-size-sm)" }}>Hasta</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: "100%", padding: "var(--mantine-spacing-xs) var(--mantine-spacing-sm)", border: "1px solid var(--mantine-color-default-border)", borderRadius: "var(--mantine-radius-sm)" }} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 4 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <Button variant="default" onClick={() => { const d = new Date().toISOString().slice(0, 10); setFrom(d); setTo(d); }}>Hoy</Button>
                <Button variant="default" onClick={() => { const n = new Date(); setFrom(new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10)); setTo(new Date(n.getFullYear(), n.getMonth() + 1, 0).toISOString().slice(0, 10)); }}>Este mes</Button>
                <Button variant="default" onClick={() => { const n = new Date(); setFrom(new Date(n.getFullYear(), 0, 1).toISOString().slice(0, 10)); setTo(new Date(n.getFullYear(), 11, 31).toISOString().slice(0, 10)); }}>Este año</Button>
                <Button variant="default" onClick={() => { setFrom(""); setTo(""); }}>Limpiar</Button>
              </div>
            </Grid.Col>
          </Grid>
          <Table.ScrollContainer minWidth={600}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>ID</Table.Th>
                  <Table.Th>Fecha</Table.Th>
                  <Table.Th>Cliente</Table.Th>
                  <Table.Th>Usuario</Table.Th>
                  <Table.Th>Monto</Table.Th>
                  <Table.Th>Medio</Table.Th>
                  <Table.Th>Facturas</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {list.map((p) => (
                  <Table.Tr key={p.id}>
                    <Table.Td>#{p.id}</Table.Td>
                    <Table.Td>{p.paid_at ?? "-"}</Table.Td>
                    <Table.Td>{p.client_id}</Table.Td>
                    <Table.Td>{p.created_by?.username ?? "-"}</Table.Td>
                    <Table.Td>{p.amount}</Table.Td>
                    <Table.Td>{p.method ?? "-"}</Table.Td>
                    <Table.Td>{(p.allocations ?? []).map((a: { invoice_id: number }) => `#${a.invoice_id}`).join(", ") || "-"}</Table.Td>
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
