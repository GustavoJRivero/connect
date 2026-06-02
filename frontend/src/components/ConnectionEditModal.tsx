import React, { useEffect, useState } from "react";
import { Modal, Select, Grid, Alert, Group, Text, NumberInput, Switch } from "@mantine/core";
import { api } from "../api";
import { Button, Field } from "../ui";
import { IpPoolPicker } from "./IpPoolPicker";

export function ConnectionEditModal(props: {
  open: boolean;
  connection: { id: number; server_id?: number; plan_profile?: string; service_address?: string; location?: string; ip?: string; pppoe_username?: string; pppoe_name?: string; pppoe_password?: string; billing_day?: number; prorate_first_month?: boolean } | null;
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
  const [ipMode, setIpMode] = useState<"auto" | "manual">("auto");
  const [pppoeUsername, setPppoeUsername] = useState("");
  const [pppoePassword, setPppoePassword] = useState("");
  const [billingDay, setBillingDay] = useState<number>(1);
  const [prorateFirstMonth, setProrateFirstMonth] = useState(true);

  useEffect(() => {
    if (!props.open) return;
    setError(null);
    setServerId(conn?.server_id != null ? String(conn.server_id) : "");
    setPlanProfile(String(conn?.plan_profile ?? "50M"));
    setServiceAddress(String(conn?.service_address ?? ""));
    setLocation(String(conn?.location ?? ""));
    const initialIp = String(conn?.ip ?? "");
    setIp(initialIp);
    setIpMode(initialIp ? "manual" : "auto");
    setPppoeUsername(String(conn?.pppoe_username ?? conn?.pppoe_name ?? ""));
    setPppoePassword(String(conn?.pppoe_password ?? ""));
    setBillingDay(conn?.billing_day ?? 1);
    setProrateFirstMonth(conn?.prorate_first_month ?? true);
  }, [props.open, conn?.id, conn?.server_id, conn?.plan_profile, conn?.service_address, conn?.location, conn?.ip, conn?.pppoe_username, conn?.pppoe_name, conn?.pppoe_password, conn?.billing_day, conn?.prorate_first_month]);

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
        // En modo "auto" se manda "" para que el backend autoasigne (o limpie si server sin pool).
        ip: ipMode === "manual" ? (ip || null) : "",
        pppoe_username: pppoeUsername.trim() || null,
        pppoe_password: pppoePassword || null,
        billing_day: billingDay,
        prorate_first_month: prorateFirstMonth,
        sync_mikrotik: true,
      });
      props.onSaved();
    } catch (e: unknown) {
      const body = (e as { body?: { error?: string; value?: string; cidr?: string } })?.body ?? e;
      const err = e as { status?: number; body?: { error?: string; value?: string; cidr?: string } };
      const code = (body as { error?: string })?.error;
      if (code === "pool_exhausted") {
        setError(`No hay IPs libres en el pool ${(body as { cidr?: string })?.cidr || ""}.`);
        return;
      }
      if (code === "ip_already_taken") {
        setError(`La IP ${(body as { value?: string })?.value} ya está asignada en este server.`);
        return;
      }
      if (code === "ip_invalid") {
        setError(`IP inválida${(body as { value?: string })?.value ? `: ${(body as { value?: string })?.value}` : ""}.`);
        return;
      }
      setError(`${err?.status ?? ""} ${JSON.stringify(body)}`);
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
      <IpPoolPicker
        serverId={serverId ? Number(serverId) : null}
        ip={ip}
        onChange={setIp}
        mode={ipMode}
        onModeChange={setIpMode}
        excludeIp={String(conn?.ip ?? "") || undefined}
      />
      <Grid>
        <Grid.Col span={6}><Field label="Usuario PPPoE" value={pppoeUsername} onChange={setPppoeUsername} /></Grid.Col>
        <Grid.Col span={6}><Field label="Contraseña PPPoE" value={pppoePassword} onChange={setPppoePassword} type="password" /></Grid.Col>
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
        <Button variant="primary" onClick={save}>Guardar</Button>
      </Group>
    </Modal>
  );
}
