import React, { useEffect, useMemo, useState } from "react";
import { Modal, Select, Grid, Alert, Group, Text, TextInput } from "@mantine/core";
import { api } from "../api";
import { Button, Field } from "../ui";

type PaymentMethod = "TRANSFER" | "MERCADOPAGO" | "CASH" | "CARD";

const PAYMENT_METHODS = [
  { value: "TRANSFER", label: "Transferencia bancaria" },
  { value: "MERCADOPAGO", label: "MercadoPago" },
  { value: "CASH", label: "Efectivo" },
  { value: "CARD", label: "Tarjeta de Crédito/Débito" },
];

export function PaymentModal(props: {
  open: boolean;
  invoice: unknown;
  onClose: () => void;
  onSaved: (payment: unknown) => void;
}) {
  const inv = props.invoice as { id: number; client_id: number; total?: number; paid_total?: number } | null;
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));

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
  }, [props.open, inv?.id, remaining]);

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
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    }
  }

  return (
    <Modal
      opened={props.open}
      onClose={props.onClose}
      title={inv ? `Registrar pago — Factura #${inv.id} (Cliente ${inv.client_id})` : "Registrar pago"}
      size="lg"
    >
      {error ? (
        <Alert color="red" className="sc-error" title="Error" mb="md">
          {error}
        </Alert>
      ) : null}
      {inv ? (
        <>
          <Grid>
            <Grid.Col span={{ base: 12, md: 5 }}>
              <Select
                label="Medio de pago"
                value={method}
                onChange={(v) => v && setMethod(v as PaymentMethod)}
                data={PAYMENT_METHODS.map((m) => ({ value: m.value, label: m.label }))}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 3 }}>
              <Field label="Monto" value={amount} onChange={setAmount} />
              <Text size="xs" c="dimmed" mt="xs">Saldo: AR$ {remaining.toFixed(2)}</Text>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 4 }}>
              <TextInput
                label="Fecha"
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.currentTarget.value)}
              />
            </Grid.Col>
          </Grid>
          <Field label="Referencia (op/comprobante)" value={reference} onChange={setReference} placeholder="Opcional" />
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={props.onClose}>Cancelar</Button>
            <Button variant="primary" onClick={save}>Registrar</Button>
          </Group>
        </>
      ) : (
        <Text size="sm" c="dimmed">Seleccioná una factura.</Text>
      )}
    </Modal>
  );
}
