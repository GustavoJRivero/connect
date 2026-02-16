import React, { useEffect, useState } from "react";
import { Modal, Select, Grid, Alert, Group, Text } from "@mantine/core";
import { api } from "../api";
import { Button, Field } from "../ui";

export function ConnectionEditModal(props: {
  open: boolean;
  connection: { id: number; server_id?: number; plan_profile?: string; service_address?: string; location?: string; ip?: string; pppoe_username?: string; pppoe_name?: string; pppoe_password?: string } | null;
  servers: { id: number; name: string; host: string; port: number }[];
  planOptions: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const conn = props.connection;
  const [error, setError] = useState<string | null>(null);
  const [serverId, setServerId] = useState("");
  const [planProfile, setPlanProfile] = useState("50M");
  const [serviceAddress, setServiceAddress] = useState("");
  const [location, setLocation] = useState("");
  const [ip, setIp] = useState("");
  const [pppoeUsername, setPppoeUsername] = useState("");
  const [pppoePassword, setPppoePassword] = useState("");

  useEffect(() => {
    if (!props.open) return;
    setError(null);
    setServerId(conn?.server_id != null ? String(conn.server_id) : "");
    setPlanProfile(String(conn?.plan_profile ?? "50M"));
    setServiceAddress(String(conn?.service_address ?? ""));
    setLocation(String(conn?.location ?? ""));
    setIp(String(conn?.ip ?? ""));
    setPppoeUsername(String(conn?.pppoe_username ?? conn?.pppoe_name ?? ""));
    setPppoePassword(String(conn?.pppoe_password ?? ""));
  }, [props.open, conn?.id, conn?.server_id, conn?.plan_profile, conn?.service_address, conn?.location, conn?.ip, conn?.pppoe_username, conn?.pppoe_name, conn?.pppoe_password]);

  async function save() {
    setError(null);
    if (!conn?.id) return;
    if (!planProfile.trim()) {
      setError("Seleccioná un plan.");
      return;
    }
    try {
      await api.updateConnection(Number(conn.id), {
        server_id: serverId ? Number(serverId) : null,
        plan_profile: planProfile,
        service_address: serviceAddress || null,
        location: location || null,
        ip: ip || null,
        pppoe_username: pppoeUsername.trim() || null,
        pppoe_password: pppoePassword || null,
        sync_mikrotik: true,
      });
      props.onSaved();
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    }
  }

  const planData = (props.planOptions?.length ? props.planOptions : ["25M", "50M", "100M", "300M"]).map((p) => ({ value: p, label: p }));
  const serverData = props.servers.map((s) => ({ value: String(s.id), label: `#${s.id} — ${s.name} (${s.host}:${s.port})` }));

  return (
    <Modal opened={props.open} onClose={props.onClose} title={`Editar conexión #${conn?.id}`} size="lg">
      {error ? (
        <Alert color="red" className="sc-error" title="Error" mb="md">
          {error}
        </Alert>
      ) : null}
      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Select label="Servidor PPPoE (Mikrotik)" value={serverId} onChange={(v) => v != null && setServerId(v)} data={[{ value: "", label: "(Seleccionar servidor)" }, ...serverData]} />
          <Text size="xs" c="dimmed" mt="xs">No se edita el estado desde acá.</Text>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Select label="Plan" value={planProfile} onChange={(v) => v && setPlanProfile(v)} data={planData} />
        </Grid.Col>
      </Grid>
      <Field label="Domicilio del servicio" value={serviceAddress} onChange={setServiceAddress} />
      <Field label="Ubicación (referencia / GPS / barrio)" value={location} onChange={setLocation} />
      <Field label="IP (opcional)" value={ip} onChange={setIp} placeholder="ej: 192.168.1.50" />
      <Grid>
        <Grid.Col span={6}><Field label="Usuario PPPoE" value={pppoeUsername} onChange={setPppoeUsername} /></Grid.Col>
        <Grid.Col span={6}><Field label="Contraseña PPPoE" value={pppoePassword} onChange={setPppoePassword} type="password" /></Grid.Col>
      </Grid>
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={props.onClose}>Cancelar</Button>
        <Button variant="primary" onClick={save}>Guardar</Button>
      </Group>
    </Modal>
  );
}
