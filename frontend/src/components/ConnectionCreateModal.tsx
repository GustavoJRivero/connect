import React, { useEffect, useState } from "react";
import { Modal, Select, Grid, Alert, Group, NumberInput, Switch, Text } from "@mantine/core";
import { api } from "../api";
import { Button, Field } from "../ui";

export function ConnectionCreateModal(props: {
  open: boolean;
  clientId: number | null;
  servers: { id: number; name: string; host: string; port: number }[];
  planOptions: string[];
  defaultServerId?: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [serverId, setServerId] = useState("");
  const [planProfile, setPlanProfile] = useState("50M");
  const [serviceAddress, setServiceAddress] = useState("");
  const [location, setLocation] = useState("");
  const [ip, setIp] = useState("");
  const [pppoeUsername, setPppoeUsername] = useState("");
  const [pppoePassword, setPppoePassword] = useState("");
  const [billingDay, setBillingDay] = useState<number>(1);
  const [prorateFirstMonth, setProrateFirstMonth] = useState(true);

  useEffect(() => {
    if (!props.open) return;
    setError(null);
    setServiceAddress("");
    setLocation("");
    setIp("");
    setPppoeUsername("");
    setPppoePassword("");
    setPlanProfile(props.planOptions?.[0] ?? "50M");
    setServerId(props.defaultServerId ? String(props.defaultServerId) : "");
    setBillingDay(1);
    setProrateFirstMonth(true);
  }, [props.open, props.clientId, props.planOptions, props.defaultServerId]);

  async function save() {
    setError(null);
    if (!props.clientId) return;
    if (!planProfile.trim()) {
      setError("Seleccioná un plan.");
      return;
    }
    try {
      await api.createConnection({
        client_id: Number(props.clientId),
        server_id: serverId ? Number(serverId) : null,
        plan_profile: planProfile,
        service_address: serviceAddress || null,
        location: location || null,
        ip: ip || null,
        pppoe_username: pppoeUsername.trim() || null,
        pppoe_password: pppoePassword || null,
        billing_day: billingDay,
        prorate_first_month: prorateFirstMonth,
        provision_mikrotik: true,
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
    <Modal opened={props.open} onClose={props.onClose} title="Nueva conexión" size="lg">
      {error ? (
        <Alert color="red" className="sc-error" title="Error" mb="md">
          {error}
        </Alert>
      ) : null}
      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Select label="Servidor PPPoE (Mikrotik)" value={serverId} onChange={(v) => v != null && setServerId(v)} data={[{ value: "", label: "(Seleccionar servidor)" }, ...serverData]} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Select label="Plan" value={planProfile} onChange={(v) => v && setPlanProfile(v)} data={planData} />
        </Grid.Col>
      </Grid>
      <Field label="Domicilio del servicio" value={serviceAddress} onChange={setServiceAddress} />
      <Field label="Ubicación (referencia / GPS / barrio)" value={location} onChange={setLocation} />
      <Field label="IP (opcional)" value={ip} onChange={setIp} placeholder="ej: 192.168.1.50" />
      <Grid>
        <Grid.Col span={6}><Field label="Usuario PPPoE (opcional)" value={pppoeUsername} onChange={setPppoeUsername} placeholder="(vacío = auto)" /></Grid.Col>
        <Grid.Col span={6}><Field label="Contraseña PPPoE (opcional)" value={pppoePassword} onChange={setPppoePassword} type="password" placeholder="(vacío = auto)" /></Grid.Col>
      </Grid>
      <Text size="sm" fw={500} mt="md" mb={4}>Facturación</Text>
      <Grid>
        <Grid.Col span={6}>
          <NumberInput
            label="Día de facturación"
            description="Día del mes (1-28). Aplica en modo individual."
            value={billingDay}
            onChange={(v) => setBillingDay(Number(v) || 1)}
            min={1}
            max={28}
          />
        </Grid.Col>
        <Grid.Col span={6}>
          <Switch
            label="Prorratear primer mes"
            description="Cobra proporcional al primer período."
            checked={prorateFirstMonth}
            onChange={(e) => setProrateFirstMonth(e.currentTarget.checked)}
            mt="md"
          />
        </Grid.Col>
      </Grid>
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={props.onClose}>Cancelar</Button>
        <Button variant="primary" onClick={save}>Crear</Button>
      </Group>
    </Modal>
  );
}
