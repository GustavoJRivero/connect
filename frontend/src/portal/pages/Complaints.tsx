import React, { useEffect, useState } from "react";
import { Alert, Select, Stack, Table, Text, Textarea, Title } from "@mantine/core";
import { Button, Card, MutedBadge, complaintStatusTone } from "../../ui";
import { complaintStatusLabel, formatApiError } from "../../format";
import { fmtDateTime } from "../../datetime";
import { portalApi } from "../api";
import { notifySuccess } from "../../notify";

export function PortalComplaints() {
  const [items, setItems] = useState<any[]>([]);
  const [conns, setConns] = useState<any[]>([]);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [kind, setKind] = useState<string>("TECH");
  const [detail, setDetail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reload() {
    Promise.all([portalApi.complaints(), portalApi.connections()])
      .then(([c, conns]) => {
        setItems(c);
        setConns(conns);
        if (!connectionId && conns[0]) setConnectionId(String(conns[0].id));
      })
      .catch((e) => setError(formatApiError(e)));
  }

  useEffect(() => {
    reload();
  }, []);

  async function submit() {
    if (!connectionId) {
      setError("Elegí una conexión.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await portalApi.createComplaint({ connection_id: Number(connectionId), kind, detail: detail.trim() });
      setDetail("");
      notifySuccess("Reclamo enviado.");
      reload();
    } catch (e: unknown) {
      setError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack gap="lg">
      <Title order={2} fw={700}>Ayuda</Title>
      {error ? <Alert color="red">{error}</Alert> : null}
      <Card title="Nuevo reclamo">
        <Stack>
          <Select
            label="Conexión"
            value={connectionId}
            onChange={setConnectionId}
            data={conns.map((c) => ({ value: String(c.id), label: `${c.pppoe_name || c.id} · ${c.plan_profile || ""}` }))}
          />
          <Select
            label="Tipo"
            value={kind}
            onChange={(v) => setKind(v || "TECH")}
            data={[{ value: "TECH", label: "Técnico" }, { value: "BILLING", label: "Facturación" }]}
          />
          <Textarea label="Qué pasó" minRows={4} value={detail} onChange={(e) => setDetail(e.currentTarget.value)} />
          <Button variant="primary" loading={busy} onClick={submit}>Enviar reclamo</Button>
        </Stack>
      </Card>
      <Table.ScrollContainer minWidth={600}>
        <Table fz="md" verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Fecha</Table.Th>
              <Table.Th>Tipo</Table.Th>
              <Table.Th>Detalle</Table.Th>
              <Table.Th>Estado</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {items.map((x) => (
              <Table.Tr key={x.id}>
                <Table.Td>{fmtDateTime(x.created_at)}</Table.Td>
                <Table.Td>{x.kind === "BILLING" ? "Facturación" : "Técnico"}</Table.Td>
                <Table.Td style={{ maxWidth: 360, whiteSpace: "pre-wrap" }}>{x.detail}</Table.Td>
                <Table.Td>
                  <MutedBadge tone={complaintStatusTone(x.status)}>{complaintStatusLabel(x.status)}</MutedBadge>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {!items.length ? <Text c="dimmed">Todavía no cargaste reclamos.</Text> : null}
    </Stack>
  );
}
