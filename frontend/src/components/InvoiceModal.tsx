import React, { useEffect, useMemo, useState } from "react";
import { Modal, Select, Grid, Alert, Group, Text } from "@mantine/core";
import { api } from "../api";
import { Button, Field } from "../ui";

type InvoiceType = "A" | "B" | "X";

export function InvoiceModal(props: {
  open: boolean;
  client?: { id: number; kind?: string } | null;
  connections?: { id: number; plan_profile?: string; service_address?: string }[] | null;
  onClose: () => void;
  onSaved: (invoice: unknown) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const [invoiceType, setInvoiceType] = useState<InvoiceType>("B");
  const [total, setTotal] = useState("");

  const hasConnections = Boolean((props.connections ?? []).length);
  const clientIdFixed = props.client?.id ? String(props.client.id) : "";
  const suggestedType = useMemo<InvoiceType>(() => {
    const kind = String(props.client?.kind ?? "").toUpperCase();
    return kind === "COMPANY" ? "A" : "B";
  }, [props.client?.kind]);

  useEffect(() => {
    if (!props.open) return;
    setError(null);
    setClientId(clientIdFixed);
    setInvoiceType(suggestedType);
    setTotal("");
    const firstConnId = props.connections?.[0]?.id;
    setConnectionId(firstConnId ? String(firstConnId) : "");
  }, [props.open, props.client?.id, clientIdFixed, suggestedType, props.connections]);

  async function save() {
    setError(null);
    const cid = Number(clientIdFixed || clientId);
    if (!cid || Number.isNaN(cid)) {
      setError("Ingresá un Client ID válido.");
      return;
    }
    const totalNum = Number(total);
    if (!total || Number.isNaN(totalNum)) {
      setError("Ingresá un monto válido.");
      return;
    }
    if (hasConnections && !connectionId) {
      setError("Seleccioná una conexión para indexar la factura.");
      return;
    }
    try {
      const payload: { client_id: number; invoice_type: InvoiceType; total: string; connection_id?: number } = {
        client_id: cid,
        invoice_type: invoiceType,
        total,
      };
      if (connectionId) payload.connection_id = Number(connectionId);
      const inv = await api.createInvoice(payload);
      props.onSaved(inv);
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    }
  }

  return (
    <Modal opened={props.open} onClose={props.onClose} title="Nueva factura (monto libre)" size="lg">
      {error ? (
        <Alert color="red" className="sc-error" title="Error" mb="md">
          {error}
        </Alert>
      ) : null}
      <Grid>
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Field label="Client ID" value={clientIdFixed || clientId} onChange={setClientId} placeholder="ej: 1" />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 5 }}>
          {hasConnections ? (
            <>
              <Select
                label="Conexión (servicio)"
                value={connectionId}
                onChange={(v) => v && setConnectionId(v)}
                data={(props.connections ?? []).map((c) => ({ value: String(c.id), label: `#${c.id} — ${c.plan_profile ?? ""} — ${c.service_address ?? "-"}` }))}
                placeholder="Seleccionar..."
              />
              <p style={{ fontSize: "var(--mantine-font-size-xs)", color: "var(--mantine-color-dimmed)" }}>La factura queda indexada a una conexión.</p>
            </>
          ) : (
            <Field label="Connection ID (opcional)" value={connectionId} onChange={setConnectionId} placeholder="ej: 1" />
          )}
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 2 }}>
          <Select
            label="Tipo"
            value={invoiceType}
            onChange={(v) => v && setInvoiceType(v as InvoiceType)}
            data={[{ value: "A", label: "A" }, { value: "B", label: "B" }, { value: "X", label: "X (No fiscal)" }]}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 2 }}>
          <Field label="Total" value={total} onChange={setTotal} placeholder="ej: 15000" />
        </Grid.Col>
      </Grid>
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={props.onClose}>Cancelar</Button>
        <Button variant="primary" onClick={save}>Guardar</Button>
      </Group>
    </Modal>
  );
}
