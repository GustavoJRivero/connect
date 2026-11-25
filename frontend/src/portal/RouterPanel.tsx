import React, { useEffect, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  CopyButton,
  Divider,
  Group,
  Loader,
  Modal,
  Paper,
  PasswordInput,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import {
  IconCheck,
  IconCopy,
  IconDevices,
  IconEye,
  IconEyeOff,
  IconNetwork,
  IconPower,
  IconRefresh,
  IconRouter,
  IconTopologyStar,
  IconWifi,
} from "@tabler/icons-react";
import { formatApiError } from "../format";
import { notifySuccess } from "../notify";
import { portalApi } from "./api";

type Level = "green" | "yellow" | "red" | "unknown";

type Overview = {
  vendor: string | null;
  model: string | null;
  can_manage: boolean;
  status: { state: string; level: Level; label: string; message: string; last_change?: string | null } | null;
  signal: { level: Level; message: string; rx_dbm: number | null } | null;
};

type WifiNetwork = { band: string; ssid: string; password: string; enabled: boolean };

type Host = {
  name: string | null;
  ip: string | null;
  mac: string | null;
  connection: "WIFI" | "CABLE";
  band: string | null;
  signal_dbm: number | null;
};

const UNAVAILABLE_CODES = new Set(["onu_not_assigned", "onu_not_found", "smartolt_not_configured"]);

function levelColor(level?: Level | null): string {
  if (level === "green") return "teal";
  if (level === "yellow") return "yellow";
  if (level === "red") return "red";
  return "gray";
}

function apiCode(e: unknown): string {
  return String((e as any)?.body?.error || "");
}

function wifiQuality(dbm: number | null): { label: string; color: string } | null {
  if (dbm == null) return null;
  if (dbm >= -60) return { label: "Excelente", color: "teal" };
  if (dbm >= -70) return { label: "Buena", color: "teal" };
  if (dbm >= -80) return { label: "Regular", color: "yellow" };
  return { label: "Débil", color: "red" };
}

function StatusTile(props: { icon: React.ReactNode; title: string; level?: Level | null; label: string; message: string }) {
  const color = levelColor(props.level);
  return (
    <Paper withBorder radius="md" p="md">
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <ThemeIcon variant="light" color={color} radius="md" size={40}>
          {props.icon}
        </ThemeIcon>
        <div style={{ minWidth: 0 }}>
          <Text size="xs" c="dimmed">{props.title}</Text>
          <Group gap={6} wrap="nowrap">
            <span className="router-dot" style={{ background: `var(--mantine-color-${color}-6)` }} />
            <Text fw={600}>{props.label}</Text>
          </Group>
          <Text size="sm" c="dimmed">{props.message}</Text>
        </div>
      </Group>
    </Paper>
  );
}

function SecretText(props: { value: string }) {
  const [show, setShow] = useState(false);
  if (!props.value) return <Text size="sm" c="dimmed">—</Text>;
  return (
    <Group gap={4} wrap="nowrap">
      <Text size="sm" ff="monospace" style={{ overflowWrap: "anywhere" }}>
        {show ? props.value : "•".repeat(Math.min(props.value.length, 12))}
      </Text>
      <Tooltip label={show ? "Ocultar" : "Mostrar"}>
        <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => setShow((v) => !v)} aria-label="Mostrar contraseña">
          {show ? <IconEyeOff size={16} /> : <IconEye size={16} />}
        </ActionIcon>
      </Tooltip>
      <CopyButton value={props.value} timeout={1500}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? "Copiada" : "Copiar"}>
            <ActionIcon variant="subtle" color={copied ? "teal" : "gray"} size="sm" onClick={copy} aria-label="Copiar contraseña">
              {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
    </Group>
  );
}

function WifiModal(props: {
  connectionId: number;
  network: WifiNetwork | null;
  onClose: () => void;
  onSaved: (n: WifiNetwork) => void;
}) {
  const isMobile = useMediaQuery("(max-width: 48em)");
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (props.network) {
      setSsid(props.network.ssid || "");
      setPassword("");
      setConfirm("");
      setError(null);
    }
  }, [props.network]);

  async function save() {
    if (!props.network) return;
    const name = ssid.trim();
    if (!name || name.length > 32) return setError("El nombre de la red debe tener entre 1 y 32 caracteres.");
    if (password.length < 8 || password.length > 63) return setError("La contraseña debe tener entre 8 y 63 caracteres.");
    if (password !== confirm) return setError("Las contraseñas no coinciden.");
    setBusy(true);
    setError(null);
    try {
      await portalApi.setOnuWifi(props.connectionId, { band: props.network.band, ssid: name, password });
      notifySuccess("Listo. Volvé a conectar tus dispositivos con la nueva contraseña.");
      props.onSaved({ ...props.network, ssid: name, password });
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      opened={!!props.network}
      onClose={props.onClose}
      title={props.network ? `Cambiar WiFi ${props.network.band} GHz` : ""}
      fullScreen={isMobile}
      centered
      radius="md"
    >
      <Stack>
        {error ? <Alert color="red">{error}</Alert> : null}
        <TextInput label="Nombre de la red (SSID)" value={ssid} maxLength={32} onChange={(e) => setSsid(e.currentTarget.value)} />
        <PasswordInput
          label="Nueva contraseña"
          description="Entre 8 y 63 caracteres, sin acentos ni ñ."
          value={password}
          maxLength={63}
          onChange={(e) => setPassword(e.currentTarget.value)}
        />
        <PasswordInput label="Repetí la contraseña" value={confirm} maxLength={63} onChange={(e) => setConfirm(e.currentTarget.value)} />
        <Alert color="yellow" variant="light">
          Al guardar, los dispositivos conectados a esta red se van a desconectar y vas a tener que volver a conectarlos con la nueva contraseña.
        </Alert>
        <Button color="violet" loading={busy} onClick={save} fullWidth>Guardar cambios</Button>
      </Stack>
    </Modal>
  );
}

function HostRow(props: { host: Host }) {
  const h = props.host;
  const wifi = h.connection === "WIFI";
  const quality = wifi ? wifiQuality(h.signal_dbm) : null;
  return (
    <Group justify="space-between" wrap="nowrap" gap="sm" py={6}>
      <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
        <ThemeIcon variant="light" color={wifi ? "violet" : "gray"} radius="md" size={34}>
          {wifi ? <IconWifi size={18} /> : <IconNetwork size={18} />}
        </ThemeIcon>
        <div style={{ minWidth: 0 }}>
          <Text size="sm" fw={600} truncate>{h.name || "Dispositivo sin nombre"}</Text>
          <Text size="xs" c="dimmed" truncate>
            {wifi ? `WiFi${h.band ? ` ${h.band} GHz` : ""}` : "Cable"}
            {h.ip ? ` · ${h.ip}` : ""}
          </Text>
        </div>
      </Group>
      {quality ? (
        <Tooltip label={`${h.signal_dbm} dBm`}>
          <Badge variant="light" color={quality.color} radius="sm">{quality.label}</Badge>
        </Tooltip>
      ) : null}
    </Group>
  );
}

export function RouterPanel(props: { connectionId: number }) {
  const { connectionId } = props;
  const isMobile = useMediaQuery("(max-width: 48em)");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [wifi, setWifi] = useState<WifiNetwork[] | null>(null);
  const [wifiLoading, setWifiLoading] = useState(false);
  const [wifiError, setWifiError] = useState<string | null>(null);
  const [editing, setEditing] = useState<WifiNetwork | null>(null);

  const [hosts, setHosts] = useState<Host[] | null>(null);
  const [hostsLoading, setHostsLoading] = useState(false);
  const [hostsError, setHostsError] = useState<string | null>(null);

  const [rebootOpen, setRebootOpen] = useState(false);
  const [rebooting, setRebooting] = useState(false);
  const [rebootError, setRebootError] = useState<string | null>(null);
  const [rebootSent, setRebootSent] = useState(false);

  function loadOverview() {
    setLoading(true);
    setError(null);
    portalApi
      .onu(connectionId)
      .then((o) => setOverview(o))
      .catch((e) => {
        const code = apiCode(e);
        if (UNAVAILABLE_CODES.has(code)) setUnavailable(String((e as any)?.body?.message || ""));
        else setError(formatApiError(e));
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId]);

  function loadWifi() {
    setWifiLoading(true);
    setWifiError(null);
    portalApi
      .onuWifi(connectionId)
      .then((r) => setWifi(r.networks || []))
      .catch((e) => setWifiError(formatApiError(e)))
      .finally(() => setWifiLoading(false));
  }

  function loadHosts() {
    setHostsLoading(true);
    setHostsError(null);
    portalApi
      .onuHosts(connectionId)
      .then((r) => setHosts(r.hosts || []))
      .catch((e) => setHostsError(formatApiError(e)))
      .finally(() => setHostsLoading(false));
  }

  async function doReboot() {
    setRebooting(true);
    setRebootError(null);
    try {
      await portalApi.rebootOnu(connectionId);
      setRebootOpen(false);
      setRebootSent(true);
      setHosts(null);
      notifySuccess("Tu equipo se está reiniciando. Puede tardar unos minutos en volver.");
    } catch (e) {
      setRebootError(formatApiError(e));
    } finally {
      setRebooting(false);
    }
  }

  if (unavailable !== null) {
    return (
      <Text size="sm" c="dimmed">
        La administración de tu equipo no está disponible para esta conexión.
      </Text>
    );
  }

  if (loading && !overview) {
    return (
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        <Skeleton h={84} radius="md" />
        <Skeleton h={84} radius="md" />
      </SimpleGrid>
    );
  }

  if (error && !overview) {
    return (
      <Alert color="red" variant="light">
        <Group justify="space-between" gap="xs">
          <Text size="sm">{error}</Text>
          <Button size="xs" variant="light" color="red" onClick={loadOverview}>Reintentar</Button>
        </Group>
      </Alert>
    );
  }

  if (!overview) return null;

  const status = overview.status;
  const online = status?.state === "ONLINE";
  const signal = overview.signal;
  const signalLabel = signal
    ? signal.level === "green" ? "Buena" : signal.level === "yellow" ? "Baja" : signal.level === "red" ? "Muy baja" : "Sin lectura"
    : "Sin lectura";
  const signalMessage = signal
    ? `${signal.message}${signal.rx_dbm != null ? ` (${signal.rx_dbm.toFixed(1)} dBm)` : ""}`
    : online ? "No pudimos leer la señal" : "El equipo no está conectado";

  return (
    <Stack gap="md">
      <Group justify="space-between" gap="xs">
        <Group gap={6}>
          <IconRouter size={18} />
          <Text fw={600}>Tu equipo</Text>
          {overview.model ? <Text size="sm" c="dimmed">· {overview.model}</Text> : null}
        </Group>
        <Tooltip label="Actualizar">
          <ActionIcon variant="subtle" color="gray" onClick={loadOverview} loading={loading} aria-label="Actualizar estado">
            <IconRefresh size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {rebootSent ? (
        <Alert color="violet" variant="light" withCloseButton onClose={() => setRebootSent(false)}>
          Le enviamos la orden de reinicio a tu equipo. En unos minutos debería volver a funcionar.
        </Alert>
      ) : null}

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        <StatusTile
          icon={<IconRouter size={22} />}
          title="Estado del equipo"
          level={status?.level}
          label={status?.label || "Desconocido"}
          message={status?.message || "No pudimos leer el estado"}
        />
        <StatusTile
          icon={<IconTopologyStar size={22} />}
          title="Señal de fibra"
          level={signal?.level ?? "unknown"}
          label={signalLabel}
          message={signalMessage}
        />
      </SimpleGrid>

      <Paper withBorder radius="md" p="md">
        <Group justify="space-between" gap="xs" mb={wifi ? "sm" : 0}>
          <Group gap="sm" wrap="nowrap">
            <ThemeIcon variant="light" color="violet" radius="md" size={36}>
              <IconWifi size={20} />
            </ThemeIcon>
            <div>
              <Text fw={600}>Tu WiFi</Text>
              <Text size="xs" c="dimmed">Nombre y contraseña de tus redes</Text>
            </div>
          </Group>
          {!wifi ? (
            <Button size="xs" variant="light" color="violet" onClick={loadWifi} loading={wifiLoading}>Ver</Button>
          ) : null}
        </Group>
        {wifiError ? <Alert color="red" variant="light" mt="sm">{wifiError}</Alert> : null}
        {wifi && !wifi.length ? <Text size="sm" c="dimmed">No encontramos redes WiFi en tu equipo.</Text> : null}
        {wifi?.map((n, i) => (
          <React.Fragment key={n.band}>
            {i > 0 ? <Divider my="sm" /> : null}
            <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
              <Stack gap={2} style={{ minWidth: 0 }}>
                <Group gap={6}>
                  <Badge variant="light" color="violet" radius="sm">{n.band} GHz</Badge>
                  {!n.enabled ? <Badge variant="light" color="gray" radius="sm">Apagada</Badge> : null}
                </Group>
                <Text size="xs" c="dimmed" mt={4}>Nombre</Text>
                <Text size="sm" fw={600} style={{ overflowWrap: "anywhere" }}>{n.ssid || "—"}</Text>
                <Text size="xs" c="dimmed" mt={4}>Contraseña</Text>
                <SecretText value={n.password} />
              </Stack>
              {overview.can_manage ? (
                <Button size="xs" variant="default" onClick={() => setEditing(n)}>Cambiar</Button>
              ) : null}
            </Group>
          </React.Fragment>
        ))}
      </Paper>

      <Paper withBorder radius="md" p="md">
        <Group justify="space-between" gap="xs">
          <Group gap="sm" wrap="nowrap">
            <ThemeIcon variant="light" color="violet" radius="md" size={36}>
              <IconDevices size={20} />
            </ThemeIcon>
            <div>
              <Text fw={600}>Equipos conectados</Text>
              <Text size="xs" c="dimmed">
                {hosts ? `${hosts.length} conectado${hosts.length === 1 ? "" : "s"}` : "Celulares, computadoras y demás"}
              </Text>
            </div>
          </Group>
          <Button
            size="xs"
            variant="light"
            color="violet"
            onClick={loadHosts}
            loading={hostsLoading}
            disabled={!online}
          >
            {hosts ? "Actualizar" : "Ver"}
          </Button>
        </Group>
        {!online && !hosts ? <Text size="xs" c="dimmed" mt="xs">Disponible cuando el equipo esté en línea.</Text> : null}
        {hostsLoading && !hosts ? (
          <Group justify="center" py="md"><Loader size="sm" color="violet" /></Group>
        ) : null}
        {hostsError ? <Alert color="red" variant="light" mt="sm">{hostsError}</Alert> : null}
        {hosts ? (
          <Stack gap={0} mt="sm">
            {!hosts.length ? <Text size="sm" c="dimmed">No hay equipos conectados en este momento.</Text> : null}
            {hosts.map((h, i) => (
              <React.Fragment key={`${h.mac || h.ip || "h"}-${i}`}>
                {i > 0 ? <Divider /> : null}
                <HostRow host={h} />
              </React.Fragment>
            ))}
          </Stack>
        ) : null}
      </Paper>

      {overview.can_manage ? (
        <Paper withBorder radius="md" p="md">
          <Group justify="space-between" gap="xs" wrap={isMobile ? "wrap" : "nowrap"}>
            <Group gap="sm" wrap="nowrap">
              <ThemeIcon variant="light" color="red" radius="md" size={36}>
                <IconPower size={20} />
              </ThemeIcon>
              <div>
                <Text fw={600}>Reiniciar equipo</Text>
                <Text size="xs" c="dimmed">Útil si internet anda lento o con cortes.</Text>
              </div>
            </Group>
            <Button size="xs" variant="light" color="red" onClick={() => { setRebootError(null); setRebootOpen(true); }}>
              Reiniciar
            </Button>
          </Group>
        </Paper>
      ) : null}

      <WifiModal
        connectionId={connectionId}
        network={editing}
        onClose={() => setEditing(null)}
        onSaved={(n) => {
          setWifi((prev) => (prev || []).map((x) => (x.band === n.band ? n : x)));
          setEditing(null);
        }}
      />

      <Modal opened={rebootOpen} onClose={() => setRebootOpen(false)} title="Reiniciar equipo" centered radius="md">
        <Stack>
          {rebootError ? <Alert color="red">{rebootError}</Alert> : null}
          <Text size="sm">
            Tu internet se va a cortar mientras el equipo se reinicia. Suele tardar entre 2 y 5 minutos en volver.
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={() => setRebootOpen(false)}>Cancelar</Button>
            <Button color="red" loading={rebooting} onClick={doReboot}>Reiniciar ahora</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
