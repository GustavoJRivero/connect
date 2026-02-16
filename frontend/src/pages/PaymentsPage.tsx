import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Button, Field } from "../ui";
import {
  Grid,
  Table,
  Select,
  Alert,
  Card,
  Title,
  Group,
  TextInput,
  Skeleton,
  Anchor,
  Text,
  Stack,
} from "@mantine/core";

type PaymentMethod = "TRANSFER" | "MERCADOPAGO" | "CASH" | "CARD";

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "TRANSFER", label: "Transferencia bancaria" },
  { value: "MERCADOPAGO", label: "MercadoPago" },
  { value: "CASH", label: "Efectivo" },
  { value: "CARD", label: "Tarjeta de Crédito/Débito" },
];

type PaymentRow = {
  id: number;
  paid_at?: string;
  client_id: number;
  created_by?: { username: string };
  amount: string;
  method?: string;
  allocations?: { invoice_id: number }[];
};

export default function PaymentsPage() {
  const [items, setItems] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
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
    setLoading(true);
    try {
      const res = await api.listPayments(clientId ? Number(clientId) : undefined, {
        from: from || undefined,
        to: to || undefined,
      });
      setItems(Array.isArray(res) ? (res as PaymentRow[]) : []);
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    } finally {
      setLoading(false);
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

  const setToday = () => {
    const d = new Date().toISOString().slice(0, 10);
    setFrom(d);
    setTo(d);
  };
  const setThisMonth = () => {
    const n = new Date();
    setFrom(new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10));
    setTo(new Date(n.getFullYear(), n.getMonth() + 1, 0).toISOString().slice(0, 10));
  };
  const setThisYear = () => {
    const n = new Date();
    setFrom(new Date(n.getFullYear(), 0, 1).toISOString().slice(0, 10));
    setTo(new Date(n.getFullYear(), 11, 31).toISOString().slice(0, 10));
  };

  return (
    <Stack gap="md">
      {error ? (
        <Alert color="red" className="sc-error" title="Error">
          {error}
        </Alert>
      ) : null}

      <Card withBorder padding="lg" radius="md">
        <Card.Section withBorder inheritPadding py="sm">
          <Group justify="space-between">
            <Title order={5}>Registrar pago</Title>
            <Group gap="xs">
              <Button variant="primary" onClick={create}>
                Registrar
              </Button>
              <Button variant="default" onClick={reload}>
                Recargar
              </Button>
            </Group>
          </Group>
        </Card.Section>
        <Grid mt="md">
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
            <TextInput
              label="Fecha"
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.currentTarget.value)}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 9 }}>
            <Field label="Nota" value={note} onChange={setNote} placeholder="Opcional" />
          </Grid.Col>
        </Grid>
      </Card>

      <Card withBorder padding="lg" radius="md">
        <Card.Section withBorder inheritPadding py="sm">
          <Title order={5}>Listado de pagos</Title>
        </Card.Section>
        <Grid mt="md" mb="md">
          <Grid.Col span={{ base: 12, md: 4 }}>
            <TextInput
              label="Desde"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.currentTarget.value)}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <TextInput
              label="Hasta"
              type="date"
              value={to}
              onChange={(e) => setTo(e.currentTarget.value)}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Text size="sm" c="dimmed" mb={4} style={{ display: "block" }}>
              Rango rápido
            </Text>
            <Group gap="xs">
              <Button variant="default" onClick={setToday}>
                Hoy
              </Button>
              <Button variant="default" onClick={setThisMonth}>
                Este mes
              </Button>
              <Button variant="default" onClick={setThisYear}>
                Este año
              </Button>
              <Button variant="default" onClick={() => { setFrom(""); setTo(""); }}>
                Limpiar
              </Button>
            </Group>
          </Grid.Col>
        </Grid>
        <Table.ScrollContainer minWidth={600}>
          <Table striped highlightOnHover>
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
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <Table.Tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <Table.Td key={j}>
                        <Skeleton height={20} width={j === 2 ? 40 : "70%"} />
                      </Table.Td>
                    ))}
                  </Table.Tr>
                ))
              ) : items.length ? (
                items.map((p) => (
                  <Table.Tr key={p.id}>
                    <Table.Td>#{p.id}</Table.Td>
                    <Table.Td>{p.paid_at ?? "-"}</Table.Td>
                    <Table.Td>
                      <Anchor component={Link} to={`/clients/${p.client_id}`} size="sm">
                        #{p.client_id}
                      </Anchor>
                    </Table.Td>
                    <Table.Td>{p.created_by?.username ?? "-"}</Table.Td>
                    <Table.Td fw={600}>{p.amount}</Table.Td>
                    <Table.Td>{p.method ?? "-"}</Table.Td>
                    <Table.Td>
                      {(p.allocations ?? []).map((a) => `#${a.invoice_id}`).join(", ") || "-"}
                    </Table.Td>
                  </Table.Tr>
                ))
              ) : (
                <Table.Tr>
                  <Table.Td colSpan={7} c="dimmed" py="xl" ta="center">
                    No hay pagos en el rango seleccionado.
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
    </Stack>
  );
}
