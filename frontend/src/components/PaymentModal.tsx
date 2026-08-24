import React, { useEffect, useMemo, useState } from "react";
import { Modal, Select, Grid, Alert, Group, Text, TextInput, Stack, Paper, SimpleGrid, NumberInput, Textarea } from "@mantine/core";
import { api } from "../api";
import { Button } from "../ui";
import { ClientSelect } from "./ClientSelect";
import { formatApiError, fmtMoney, todayISO } from "../format";

type PaymentMethod = "TRANSFER" | "MERCADOPAGO" | "CASH" | "CARD";

const PAYMENT_METHODS = [
  { value: "CASH", label: "Efectivo" },
  { value: "TRANSFER", label: "Transferencia bancaria" },
  { value: "MERCADOPAGO", label: "Mercado Pago" },
  { value: "CARD", label: "Tarjeta" },
];

type InvoiceRef = {
  id: number;
  client_id: number;
  client_name?: string;
  total?: string | number;
  paid_total?: string | number;
  description?: string;
  invoice_type?: string;
};

/**
 * Registra un pago. Dos modos:
 *  - Con `invoice`: pago aplicado a esa factura (monto sugerido = saldo).
 *  - Sin factura: se elige el cliente y el backend imputa a las pendientes.
 */
export function PaymentModal(props: {
  open: boolean;
  invoice?: InvoiceRef | unknown | null;
  client?: { id: number; full_name?: string } | null;
  onClose: () => void;
  onSaved: (payment: unknown) => void;
}) {
  const inv = (props.invoice ?? null) as InvoiceRef | null;
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [amount, setAmount] = useState<number | string>("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [paidAt, setPaidAt] = useState(() => todayISO());
  const [pickedClientId, setPickedClientId] = useState("");

  const remaining = useMemo(() => {
    const t = Number(inv?.total ?? 0);
    const p = Number(inv?.paid_total ?? 0);
    return Math.max(0, t - p);
  }, [inv]);

  const clientId = inv
    ? Number(inv.client_id)
    : props.client
      ? Number(props.client.id)
      : pickedClientId
        ? Number(pickedClientId)
        : null;
  const clientName =
    inv?.client_name?.trim()
    || props.client?.full_name?.trim()
    || (clientId ? `Cliente #${clientId}` : "");

  useEffect(() => {
    if (!props.open) return;
    setError(null);
    setMethod("CASH");
    setReference("");
    setNote("");
    setPaidAt(todayISO());
    setPickedClientId(props.client && !inv ? String(props.client.id) : "");
    if (inv) {
      const suggested = remaining > 0 ? remaining : Number(inv.total ?? 0);
      setAmount(Number.isFinite(suggested) ? Number(suggested.toFixed(2)) : "");
    } else {
      setAmount("");
    }
  }, [props.open, inv?.id, remaining, props.client?.id]);

  async function save() {
    if (saving) return;
    setError(null);
    if (!clientId) {
      setError("Seleccioná un cliente.");
      return;
    }
    const n = typeof amount === "number" ? amount : Number(String(amount).replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      setError("Ingresá un monto válido.");
      return;
    }
    setSaving(true);
    try {
      const payment = await api.createPayment({
        client_id: clientId,
        amount: n.toFixed(2),
        method,
        reference: reference.trim() || null,
        note: note.trim() || null,
        paid_at: paidAt || null,
        ...(inv ? { invoice_ids: [Number(inv.id)] } : {}),
      });
      props.onSaved(payment);
    } catch (e: unknown) {
      setError(formatApiError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal opened={props.open} onClose={props.onClose} title="Registrar pago" size="lg">
      <Stack gap="md">
        {error ? (
          <Alert color="red" title="Error" withCloseButton onClose={() => setError(null)}>
            {error}
          </Alert>
        ) : null}

        {inv ? (
          <Paper withBorder p="sm" radius="md">
            <Text size="sm" c="dimmed" fw={500} mb={6}>
              {clientName} · Factura #{inv.id}{inv.invoice_type ? ` (${inv.invoice_type})` : ""}
            </Text>
            {inv.description ? (
              <Text size="sm" mb="sm">{inv.description}</Text>
            ) : null}
            <SimpleGrid cols={3} spacing="sm">
              <div>
                <Text size="xs" c="dimmed">Total</Text>
                <Text size="sm" fw={600}>{fmtMoney(inv.total)}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">Pagado</Text>
                <Text size="sm" fw={600}>{fmtMoney(inv.paid_total ?? 0)}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">Saldo</Text>
                <Text size="sm" fw={600}>{fmtMoney(remaining)}</Text>
              </div>
            </SimpleGrid>
          </Paper>
        ) : props.client ? (
          <Paper withBorder p="sm" radius="md">
            <Text size="xs" c="dimmed">Cliente</Text>
            <Text size="sm" fw={600}>{clientName}</Text>
            <Text size="xs" c="dimmed" mt={6}>
              Se imputa a las facturas pendientes, de la más vieja a la más nueva.
            </Text>
          </Paper>
        ) : (
          <ClientSelect
            label="Cliente"
            required
            value={pickedClientId}
            onChange={setPickedClientId}
          />
        )}

        <Grid>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Medio de pago"
              withAsterisk
              value={method}
              onChange={(v) => v && setMethod(v as PaymentMethod)}
              data={PAYMENT_METHODS}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <NumberInput
              label="Monto"
              withAsterisk
              placeholder="0,00"
              value={amount}
              onChange={setAmount}
              min={0}
              decimalScale={2}
              thousandSeparator="."
              decimalSeparator=","
              prefix="$ "
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Fecha"
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.currentTarget.value)}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Referencia"
              value={reference}
              onChange={(e) => setReference(e.currentTarget.value)}
              placeholder="N° de operación / comprobante"
            />
          </Grid.Col>
        </Grid>

        <Textarea
          label="Nota (opcional)"
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          placeholder="Observación interna"
          autosize
          minRows={2}
          maxRows={4}
        />

        <Group justify="flex-end">
          <Button variant="default" disabled={saving} onClick={props.onClose}>Cancelar</Button>
          <Button variant="primary" loading={saving} onClick={save}>Registrar pago</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
