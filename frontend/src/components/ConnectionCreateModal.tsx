import React, { useEffect, useState } from "react";
import { Alert, Group, Modal, NumberInput, Paper, PasswordInput, Select, SimpleGrid, Stack, Switch, Text, TextInput, ThemeIcon } from "@mantine/core";
import { IconBarcode, IconKey, IconLock, IconMapPin, IconPlugConnected, IconReceipt, IconRouter, IconUser } from "@tabler/icons-react";
import { api, newestServerId } from "../api";
import { Button } from "../ui";
import { IpPoolPicker } from "./IpPoolPicker";
import { CoverageCheck, CoveragePreview } from "./CoverageCheck";
import { FormSection } from "./FormSection";
import { formatApiError } from "../format";

export type CreatedInstallationOrder = { id: number; status: string; nap_name?: string | null; last_maps_error?: string | null };

export function ConnectionCreateModal(props: {
  open: boolean;
  clientId: number | null;
  clientName?: string | null;
  servers: { id: number; name: string; host: string; port: number }[];
  planOptions: string[];
  defaultServerId?: number | null;
  onClose: () => void;
  onSaved: (order: CreatedInstallationOrder | null) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [serverId, setServerId] = useState("");
  const [planProfile, setPlanProfile] = useState("50M");
  const [serviceAddress, setServiceAddress] = useState("");
  const [location, setLocation] = useState("");
  const [locationUrl, setLocationUrl] = useState("");
  const [coverage, setCoverage] = useState<CoveragePreview | null>(null);
  const [ip, setIp] = useState("");
  const [ipMode, setIpMode] = useState<"auto" | "manual">("auto");
  const [pppoeUsername, setPppoeUsername] = useState("");
  const [pppoePassword, setPppoePassword] = useState("");
  const [ponSn, setPonSn] = useState("");
  const [billingDay, setBillingDay] = useState<number>(1);
  const [prorateFirstMonth, setProrateFirstMonth] = useState(true);

  useEffect(() => {
    if (!props.open) return;
    setError(null);
    setServiceAddress("");
    setLocation("");
    setLocationUrl("");
    setCoverage(null);
    setIp("");
    setIpMode("auto");
    setPppoeUsername("");
    setPppoePassword("");
    setPonSn("");
    setPlanProfile(props.planOptions?.[0] ?? "50M");
    setBillingDay(1);
    setProrateFirstMonth(true);
  }, [props.open, props.clientId, props.planOptions]);

  useEffect(() => {
    if (!props.open) return;
    const fallback = newestServerId(props.servers);
    setServerId(props.defaultServerId ? String(props.defaultServerId) : fallback ? String(fallback) : "");
  }, [props.open, props.clientId, props.defaultServerId, props.servers]);

  const verified = Boolean(locationUrl.trim() && coverage);

  async function save() {
    if (saving || !props.clientId) return;
    setError(null);
    if (!verified) {
      setError("Verificá la cobertura de la ubicación antes de crear la conexión.");
      return;
    }
    if (!planProfile.trim()) {
      setError("Seleccioná un plan.");
      return;
    }
    setSaving(true);
    try {
      const res = await api.createConnection({
        client_id: Number(props.clientId),
        server_id: serverId ? Number(serverId) : null,
        plan_profile: planProfile,
        service_address: serviceAddress || null,
        location: location || null,
        location_url: locationUrl || null,
        ip: ipMode === "manual" ? (ip || null) : null,
        pppoe_username: pppoeUsername.trim() || null,
        pppoe_password: pppoePassword || null,
        pon_sn: ponSn.trim() || null,
        billing_day: billingDay,
        prorate_first_month: prorateFirstMonth,
        provision_mikrotik: true,
      }) as { installation_order?: CreatedInstallationOrder };
      props.onSaved(res?.installation_order ?? null);
    } catch (e: unknown) {
      setError(formatApiError(e));
    } finally {
      setSaving(false);
    }
  }

  const planData = (props.planOptions?.length ? props.planOptions : ["25M", "50M", "100M", "300M"]).map((p) => ({ value: p, label: p }));
  const serverData = props.servers.map((s) => ({ value: String(s.id), label: `${s.name} (${s.host}:${s.port})` }));

  const header = (
    <Group gap="sm" wrap="nowrap">
      <ThemeIcon size={40} radius="xl" variant="light" color="violet">
        <IconPlugConnected size={22} />
      </ThemeIcon>
      <div>
        <Text fw={600}>Nueva conexión</Text>
        <Text size="xs" c="dimmed">
          {props.clientName ? `${props.clientName} · ` : ""}Cliente #{props.clientId}
        </Text>
      </div>
    </Group>
  );

  return (
    <Modal opened={props.open} onClose={props.onClose} title={header} size="lg" radius="lg" padding="lg">
      <Stack gap="md">
        {error ? (
          <Alert color="red" className="sc-error" title="Error">
            {error}
          </Alert>
        ) : null}

        <FormSection
          icon={<IconMapPin size={20} />}
          title="Ubicación y cobertura"
          description="Primero verificamos que llegue la fibra a ese domicilio."
        >
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput
              label="Domicilio del servicio"
              placeholder="Calle y número"
              value={serviceAddress}
              onChange={(e) => setServiceAddress(e.currentTarget.value)}
              maxLength={255}
            />
            <TextInput
              label="Referencia"
              placeholder="Barrio, entre calles, color de casa..."
              value={location}
              onChange={(e) => setLocation(e.currentTarget.value)}
              maxLength={255}
            />
          </SimpleGrid>
          <CoverageCheck
            locationUrl={locationUrl}
            onLocationUrlChange={setLocationUrl}
            coverage={coverage}
            onCoverageChange={setCoverage}
            onError={setError}
          />
        </FormSection>

        {verified ? (
          <>
            <FormSection icon={<IconRouter size={20} />} title="Servicio" description="Plan contratado y dónde se da de alta el usuario PPPoE.">
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <Select
                  label="Servidor PPPoE (Mikrotik)"
                  placeholder={serverData.length ? "Seleccionar servidor" : "No hay servidores cargados"}
                  value={serverId || null}
                  onChange={(v) => setServerId(v ?? "")}
                  data={serverData}
                  clearable
                />
                <Select
                  label="Plan"
                  withAsterisk
                  value={planProfile}
                  onChange={(v) => v && setPlanProfile(v)}
                  data={planData}
                  allowDeselect={false}
                />
              </SimpleGrid>
              <IpPoolPicker
                serverId={serverId ? Number(serverId) : null}
                ip={ip}
                onChange={setIp}
                mode={ipMode}
                onModeChange={setIpMode}
              />
            </FormSection>

            <FormSection icon={<IconKey size={20} />} title="Acceso y equipo" description="Si dejás el usuario y la contraseña vacíos se generan solos.">
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <TextInput
                  label="Usuario PPPoE"
                  placeholder="Automático"
                  leftSection={<IconUser size={16} />}
                  value={pppoeUsername}
                  onChange={(e) => setPppoeUsername(e.currentTarget.value)}
                />
                <PasswordInput
                  label="Contraseña PPPoE"
                  placeholder="Automática"
                  value={pppoePassword}
                  onChange={(e) => setPppoePassword(e.currentTarget.value)}
                />
              </SimpleGrid>
              <TextInput
                label="PON SN de la ONU"
                placeholder="ej: HWTC1234ABCD"
                leftSection={<IconBarcode size={16} />}
                value={ponSn}
                onChange={(e) => setPonSn(e.currentTarget.value)}
                maxLength={64}
              />
            </FormSection>

            <FormSection icon={<IconReceipt size={20} />} title="Facturación" description="Cómo se cobra esta conexión.">
              <SimpleGrid cols={{ base: 1, sm: 2 }} verticalSpacing="md">
                <NumberInput
                  label="Día de facturación"
                  description="Del 1 al 28. Aplica en modo individual."
                  inputWrapperOrder={["label", "input", "description"]}
                  value={billingDay}
                  onChange={(v) => setBillingDay(Number(v) || 1)}
                  min={1}
                  max={28}
                />
                <Group justify="space-between" wrap="nowrap" gap="md" align="center">
                  <div>
                    <Text size="sm" fw={500}>Prorratear primer mes</Text>
                    <Text size="xs" c="dimmed">Cobra proporcional al primer período.</Text>
                  </div>
                  <Switch size="md" checked={prorateFirstMonth} onChange={(e) => setProrateFirstMonth(e.currentTarget.checked)} />
                </Group>
              </SimpleGrid>
            </FormSection>
          </>
        ) : (
          <Paper withBorder radius="md" p="lg" style={{ borderStyle: "dashed" }}>
            <Group gap="sm" wrap="nowrap" justify="center">
              <IconLock size={18} color="var(--mantine-color-dimmed)" />
              <Text size="sm" c="dimmed">Verificá la cobertura para cargar el plan, el acceso y la facturación.</Text>
            </Group>
          </Paper>
        )}

        <Group justify="flex-end" gap="sm" mt="xs">
          <Button variant="ghost" disabled={saving} onClick={props.onClose}>Cancelar</Button>
          <Button variant="primary" loading={saving} disabled={!verified} onClick={save}>
            {verified && !coverage?.available ? "Guardar sin cobertura" : "Crear conexión"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
