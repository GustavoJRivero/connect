import React, { useEffect, useState } from "react";
import { Modal, Grid, Alert, Group, Text } from "@mantine/core";
import { api } from "../api";
import { Button, Field } from "../ui";

export function ConnectionDetailsModal(props: {
  open: boolean;
  connection: { id: number; pppoe_name?: string; plan_profile?: string; status?: string; server_name?: string; server_id?: number; ip?: string; last_uptime?: string; last_connected_at?: string; last_disconnected_at?: string } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const conn = props.connection;
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ active?: boolean; assigned_ip?: string; uptime?: string; fetched_at?: string } | null>(null);
  const [ip, setIp] = useState("");

  useEffect(() => {
    if (!props.open) return;
    setError(null);
    setStatus(null);
    setIp(String(conn?.ip ?? ""));
    if (!conn?.id) return;
    api
      .getConnectionMtStatus(Number(conn.id))
      .then(setStatus as (v: unknown) => void)
      .catch((e: unknown) => {
        const err = e as { status?: number; body?: unknown };
        setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
      });
  }, [props.open, conn?.id, conn?.ip]);

  async function saveIp() {
    setError(null);
    if (!conn?.id) return;
    try {
      await api.updateConnection(Number(conn.id), { ip: ip || null, sync_mikrotik: true });
      props.onSaved();
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    }
  }

  return (
    <Modal opened={props.open} onClose={props.onClose} title={`Conexión #${conn?.id} — Detalles`} size="lg">
      {error ? <Alert color="red" className="sc-error" mb="md">{error}</Alert> : null}
      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Text size="sm" c="dimmed">PPPoE: {conn?.pppoe_name ?? "-"}</Text>
          <Text size="sm" c="dimmed">Plan: {conn?.plan_profile ?? "-"}</Text>
          <Text size="sm" c="dimmed">Estado: {conn?.status === "CUT" ? "Suspend" : "Active"}</Text>
          <Text size="sm" c="dimmed">Server: {conn?.server_name ?? conn?.server_id ?? "-"}</Text>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Text size="sm" c="dimmed">IP: {conn?.ip ?? "-"}</Text>
          <Text size="sm" c="dimmed">Uptime (último): {conn?.last_uptime ?? "-"}</Text>
          <Text size="sm" c="dimmed">Última conexión: {conn?.last_connected_at ? String(conn.last_connected_at).replace("T", " ").slice(0, 19) : "-"}</Text>
          <Text size="sm" c="dimmed">Última desconexión: {conn?.last_disconnected_at ? String(conn.last_disconnected_at).replace("T", " ").slice(0, 19) : "-"}</Text>
        </Grid.Col>
      </Grid>
      <hr style={{ border: "none", borderTop: "1px solid var(--mantine-color-default-border)", margin: "16px 0" }} />
      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Field label="IP (opcional)" value={ip} onChange={setIp} placeholder="ej: 192.168.1.50" />
          <p style={{ fontSize: "var(--mantine-font-size-xs)", color: "var(--mantine-color-dimmed)" }}>Si se setea, se aplica al PPP secret como IP fija (remote-address).</p>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Text size="sm" c="dimmed">Estado Mikrotik (en vivo)</Text>
          <Text size="sm" c="dimmed">Activo: {status ? (status.active ? "Sí" : "No") : "..."}</Text>
          <Text size="sm" c="dimmed">IP asignada: {status?.assigned_ip ?? "-"}</Text>
          <Text size="sm" c="dimmed">Tiempo de conexión: {status?.uptime ?? "-"}</Text>
          <Text size="sm" c="dimmed">Actualizado: {status?.fetched_at ? String(status.fetched_at).replace("T", " ").slice(0, 19) : "-"}</Text>
        </Grid.Col>
      </Grid>
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={props.onClose}>Cerrar</Button>
        <Button variant="primary" onClick={saveIp}>Guardar</Button>
      </Group>
    </Modal>
  );
}
