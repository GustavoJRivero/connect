import React, { useEffect, useState } from "react";
import { Modal, Grid, Alert, Group, Text, Divider } from "@mantine/core";
import { api } from "../api";
import { Button, Field, MutedBadge, connectionStatusTone } from "../ui";
import { formatApiError, connectionStatusLabel } from "../format";
import { fmtDateTime } from "../datetime";

export function ConnectionDetailsModal(props: {
  open: boolean;
  connection: { id: number; pppoe_name?: string; plan_profile?: string; status?: string; server_name?: string; server_id?: number; ip?: string; pon_sn?: string; last_uptime?: string; last_connected_at?: string; last_disconnected_at?: string } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const conn = props.connection;
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ active?: boolean; assigned_ip?: string; uptime?: string; fetched_at?: string } | null>(null);
  const [ip, setIp] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!props.open) return;
    setError(null);
    setStatus(null);
    setIp(String(conn?.ip ?? ""));
    if (!conn?.id) return;
    if (!conn.server_id) {
      setStatus({ active: false });
      return;
    }
    api
      .getConnectionMtStatus(Number(conn.id))
      .then(setStatus as (v: unknown) => void)
      .catch((e: unknown) => {
        setError(formatApiError(e));
      });
  }, [props.open, conn?.id, conn?.ip]);

  async function saveIp() {
    if (saving) return;
    setError(null);
    if (!conn?.id) return;
    setSaving(true);
    try {
      await api.updateConnection(Number(conn.id), { ip: ip || null, sync_mikrotik: true });
      props.onSaved();
    } catch (e: unknown) {
      setError(formatApiError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal opened={props.open} onClose={props.onClose} title={`Conexión #${conn?.id} — Detalles`} size="lg">
      {error ? (
        <Alert color="red" className="sc-error" title="Error" mb="md">
          {error}
        </Alert>
      ) : null}
      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Text size="sm" c="dimmed">PPPoE: {conn?.pppoe_name ?? "-"}</Text>
          <Group gap="xs" mt={4} mb={4}>
            {conn?.plan_profile ? <MutedBadge tone="lilac" size="sm">{conn.plan_profile}</MutedBadge> : null}
            <MutedBadge tone={connectionStatusTone(conn?.status)} size="sm">{connectionStatusLabel(conn?.status)}</MutedBadge>
          </Group>
          <Text size="sm" c="dimmed">Server: {conn?.server_name ?? conn?.server_id ?? "-"}</Text>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Text size="sm" c="dimmed">IP: {conn?.ip ?? "-"}</Text>
          <Text size="sm" c="dimmed">PON SN: {conn?.pon_sn ?? "-"}</Text>
          <Text size="sm" c="dimmed">Uptime (último): {conn?.last_uptime ?? "-"}</Text>
          <Text size="sm" c="dimmed">Última conexión: {fmtDateTime(conn?.last_connected_at) || "-"}</Text>
          <Text size="sm" c="dimmed">Última desconexión: {fmtDateTime(conn?.last_disconnected_at) || "-"}</Text>
        </Grid.Col>
      </Grid>
      <Divider my="md" />
      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Field label="IP (opcional)" value={ip} onChange={setIp} placeholder="ej: 192.168.1.50" />
          <Text size="xs" c="dimmed" mt="xs">Si se setea, se aplica al PPP secret como IP fija (remote-address).</Text>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Text size="sm" c="dimmed">Estado Mikrotik (en vivo)</Text>
          {conn?.server_id ? (
            <>
              <Text size="sm" c="dimmed">Activo: {status ? (status.active ? "Sí" : "No") : "..."}</Text>
              <Text size="sm" c="dimmed">IP asignada: {status?.assigned_ip ?? "-"}</Text>
              <Text size="sm" c="dimmed">Tiempo de conexión: {status?.uptime ?? "-"}</Text>
              <Text size="sm" c="dimmed">Actualizado: {fmtDateTime(status?.fetched_at) || "-"}</Text>
            </>
          ) : (
            <Text size="sm" c="dimmed">Sin servidor asignado: no hay estado en vivo.</Text>
          )}
        </Grid.Col>
      </Grid>
      <Group justify="flex-end" mt="md">
        <Button variant="default" disabled={saving} onClick={props.onClose}>Cerrar</Button>
        <Button variant="primary" loading={saving} onClick={saveIp}>Guardar</Button>
      </Group>
    </Modal>
  );
}
