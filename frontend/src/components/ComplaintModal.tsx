import React, { useEffect, useState } from "react";
import { Modal, Select, Alert, Group } from "@mantine/core";
import { api } from "../api";
import { Button, Field } from "../ui";

type ComplaintKind = "BILLING" | "TECH";

export function ComplaintModal(props: {
  open: boolean;
  client: { id?: number } | null;
  connections: { id: number }[];
  onClose: () => void;
  onSaved: (complaint: unknown) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [connectionId, setConnectionId] = useState("");
  const [kind, setKind] = useState<ComplaintKind>("TECH");
  const [detail, setDetail] = useState("");
  const defaultConnId = props.connections?.[0]?.id ? String(props.connections[0].id) : "";
  const clientId = Number(props.client?.id ?? 0);

  useEffect(() => {
    if (!props.open) return;
    setError(null);
    setKind("TECH");
    setDetail("");
    setConnectionId(defaultConnId);
  }, [props.open, props.client?.id, defaultConnId]);

  async function save() {
    setError(null);
    if (!clientId || Number.isNaN(clientId)) {
      setError("Cliente inválido.");
      return;
    }
    if (!connectionId) {
      setError("Seleccioná una conexión.");
      return;
    }
    if (!detail.trim()) {
      setError("Ingresá el detalle.");
      return;
    }
    try {
      const created = await api.createComplaint({
        client_id: clientId,
        connection_id: Number(connectionId),
        kind,
        detail,
        status: "TODO",
      });
      props.onSaved(created);
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    }
  }

  return (
    <Modal opened={props.open} onClose={props.onClose} title="Nuevo reclamo" size="lg">
      {error ? (
        <Alert color="red" className="sc-error" title="Error" mb="md">
          {error}
        </Alert>
      ) : null}
      <Select
        label="Conexión"
        value={connectionId}
        onChange={(v) => v && setConnectionId(v)}
        data={props.connections.map((c) => ({ value: String(c.id), label: `#${c.id}` }))}
      />
      <Select
        label="Tipo"
        value={kind}
        onChange={(v) => v && setKind(v as ComplaintKind)}
        data={[{ value: "TECH", label: "Técnico" }, { value: "BILLING", label: "Facturación" }]}
        mt="sm"
      />
      <Field label="Detalle" value={detail} onChange={setDetail} placeholder="Descripción del reclamo" />
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={props.onClose}>Cancelar</Button>
        <Button variant="primary" onClick={save}>Guardar</Button>
      </Group>
    </Modal>
  );
}
