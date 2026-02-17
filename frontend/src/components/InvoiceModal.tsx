import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  Select,
  Grid,
  Alert,
  Group,
  Text,
  Textarea,
  NumberInput,
  Stack,
  Divider,
  Badge,
} from "@mantine/core";
import { api } from "../api";
import { Button, Field } from "../ui";

type InvoiceType = "A" | "B" | "X";

type ClientOption = {
  id: number;
  full_name: string;
  kind?: string;
  email?: string;
};

type ConnectionOption = {
  id: number;
  plan_profile?: string;
  service_address?: string;
};

export function InvoiceModal(props: {
  open: boolean;
  client?: { id: number; kind?: string } | null;
  connections?: ConnectionOption[] | null;
  onClose: () => void;
  onSaved: (invoice: unknown) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Client search
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [loadingClients, setLoadingClients] = useState(false);

  // Connections for selected client
  const [connections, setConnections] = useState<ConnectionOption[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);

  // Invoice fields
  const [invoiceType, setInvoiceType] = useState<InvoiceType>("B");
  const [total, setTotal] = useState<number | string>("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");

  // Stable references from props
  const propsClientId = props.client?.id ?? null;
  const propsClientKind = props.client?.kind ?? null;
  const propsConnections = props.connections;

  // Load client list for the selector
  const loadClients = useCallback(async () => {
    setLoadingClients(true);
    try {
      const res = (await api.listClients({ limit: 500 })) as any;
      const items: ClientOption[] = Array.isArray(res)
        ? res
        : Array.isArray(res?.items)
          ? res.items
          : [];
      setClients(items);
    } catch {
      // ignore
    } finally {
      setLoadingClients(false);
    }
  }, []);

  // Load connections when a client is selected
  const loadConnections = useCallback(async (clientId: number) => {
    try {
      const res = (await api.getClient(clientId)) as any;
      const conns: ConnectionOption[] = res?.connections ?? [];
      setConnections(conns);
    } catch {
      setConnections([]);
    }
  }, []);

  // Reset form when modal opens — only depends on stable primitives
  useEffect(() => {
    if (!props.open) return;
    setError(null);
    setSaving(false);
    setDescription("");
    setNotes("");
    setTotal("");
    setSelectedConnectionId(null);

    if (propsClientId) {
      setSelectedClientId(String(propsClientId));
      const suggestedType: InvoiceType =
        String(propsClientKind ?? "").toUpperCase() === "COMPANY" ? "A" : "B";
      setInvoiceType(suggestedType);
      setConnections(propsConnections ?? []);
    } else {
      setSelectedClientId(null);
      setInvoiceType("B");
      setConnections([]);
      loadClients();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, propsClientId]);

  // When client selection changes, load their connections and update invoice type
  useEffect(() => {
    if (!selectedClientId || propsClientId) return;
    const cid = Number(selectedClientId);
    if (!cid) return;

    const cl = clients.find((c) => c.id === cid);
    if (cl) {
      const suggestedType: InvoiceType =
        String(cl.kind ?? "").toUpperCase() === "COMPANY" ? "A" : "B";
      setInvoiceType(suggestedType);
    }
    loadConnections(cid);
    setSelectedConnectionId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClientId]);

  // Client select data
  const clientSelectData = useMemo(() => {
    return clients.map((c) => ({
      value: String(c.id),
      label: `${c.full_name}${c.email ? ` (${c.email})` : ""}`,
    }));
  }, [clients]);

  // Connection select data
  const connectionSelectData = useMemo(() => {
    const conns = propsClientId ? (propsConnections ?? []) : connections;
    return conns.map((c) => ({
      value: String(c.id),
      label: `#${c.id} — ${c.plan_profile ?? "Sin plan"} — ${c.service_address ?? "Sin dirección"}`,
    }));
  }, [connections, propsConnections, propsClientId]);

  const selectedClient = useMemo(() => {
    if (!selectedClientId) return null;
    return clients.find((c) => c.id === Number(selectedClientId)) ?? null;
  }, [selectedClientId, clients]);

  async function save() {
    setError(null);

    const cid = propsClientId
      ? propsClientId
      : Number(selectedClientId);
    if (!cid || Number.isNaN(cid)) {
      setError("Seleccioná un cliente.");
      return;
    }

    const totalNum = typeof total === "number" ? total : Number(total);
    if (!totalNum || Number.isNaN(totalNum) || totalNum <= 0) {
      setError("Ingresá un monto válido mayor a 0.");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        client_id: cid,
        invoice_type: invoiceType,
        total: String(totalNum),
      };
      if (selectedConnectionId) {
        payload.connection_id = Number(selectedConnectionId);
      }
      if (description.trim()) {
        payload.description = description.trim();
      }
      if (notes.trim()) {
        payload.notes = notes.trim();
      }

      const inv = await api.createInvoice(payload);
      props.onSaved(inv);
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal opened={props.open} onClose={props.onClose} title="Nueva factura" size="lg">
      <Stack gap="md">
        {error ? (
          <Alert color="red" title="Error" withCloseButton onClose={() => setError(null)}>
            {error}
          </Alert>
        ) : null}

        {/* Cliente */}
        {propsClientId ? (
          <Alert variant="light" color="blue" title="Cliente seleccionado">
            <Text size="sm">
              ID #{propsClientId} — Tipo: {propsClientKind ?? "PERSON"}
            </Text>
          </Alert>
        ) : (
          <Select
            label="Cliente"
            placeholder="Buscá por nombre..."
            data={clientSelectData}
            value={selectedClientId}
            onChange={(v) => setSelectedClientId(v)}
            searchable
            clearable
            nothingFoundMessage="No se encontraron clientes"
            limit={50}
          />
        )}

        {selectedClient ? (
          <Group gap="xs">
            <Badge variant="light" size="sm">
              {selectedClient.kind === "COMPANY" ? "Empresa" : "Persona"}
            </Badge>
            {selectedClient.email ? (
              <Badge variant="light" color="gray" size="sm">
                {selectedClient.email}
              </Badge>
            ) : null}
          </Group>
        ) : null}

        <Divider label="Detalle de la factura" labelPosition="center" />

        <Grid>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Select
              label="Tipo de comprobante"
              value={invoiceType}
              onChange={(v) => v && setInvoiceType(v as InvoiceType)}
              data={[
                { value: "A", label: "Factura A" },
                { value: "B", label: "Factura B" },
                { value: "X", label: "Comprobante X (No fiscal)" },
              ]}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <NumberInput
              label="Monto total ($)"
              placeholder="ej: 15000"
              value={total}
              onChange={setTotal}
              min={0}
              decimalScale={2}
              thousandSeparator="."
              decimalSeparator=","
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Select
              label="Conexión (opcional)"
              placeholder="Sin conexión asociada"
              data={connectionSelectData}
              value={selectedConnectionId}
              onChange={(v) => setSelectedConnectionId(v)}
              clearable
              nothingFoundMessage="Sin conexiones"
            />
          </Grid.Col>
        </Grid>

        <Field
          label="Concepto / Descripción"
          value={description}
          onChange={setDescription}
          placeholder="ej: Servicio de internet mes de Febrero, Instalación, Cargo adicional..."
        />

        <Textarea
          label="Observaciones (opcional)"
          placeholder="Notas internas o para el cliente..."
          value={notes}
          onChange={(e) => setNotes(e.currentTarget.value)}
          autosize
          minRows={2}
          maxRows={4}
        />

        <Divider />

        <Group justify="flex-end">
          <Button variant="default" onClick={props.onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? "Guardando..." : "Crear factura"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
