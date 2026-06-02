import React, { useEffect, useState } from "react";
import { Modal, Grid, Alert, Group, Checkbox, Stack, Skeleton, NumberInput, Text } from "@mantine/core";
import { api } from "../api";
import { Button, Field } from "../ui";

const MAX_POOLS = 5;

export function ServerEditModal(props: {
  open: boolean;
  serverId: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("8728");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [useSsl, setUseSsl] = useState(false);
  const [localAddress, setLocalAddress] = useState("");
  const [ipPoolCidrs, setIpPoolCidrs] = useState<string[]>([""]);
  const [poolsCount, setPoolsCount] = useState<number>(1);

  useEffect(() => {
    if (!props.open) return;
    setError(null);
    setTestResult(null);
    if (!props.serverId) {
      setName("");
      setHost("");
      setPort("8728");
      setUsername("");
      setPassword("");
      setUseSsl(false);
      setLocalAddress("");
      setIpPoolCidrs([""]);
      setPoolsCount(1);
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .getServer(Number(props.serverId))
      .then((s: unknown) => {
        const x = s as {
          name?: string;
          host?: string;
          port?: number;
          username?: string;
          use_ssl?: boolean;
          local_address?: string;
          ip_pool_cidrs?: string[];
        };
        setName(String(x?.name ?? ""));
        setHost(String(x?.host ?? ""));
        setPort(String(x?.port ?? "8728"));
        setUsername(String(x?.username ?? ""));
        setPassword("");
        setUseSsl(Boolean(x?.use_ssl ?? false));
        setLocalAddress(String(x?.local_address ?? ""));
        const cidrs = Array.isArray(x?.ip_pool_cidrs) ? (x?.ip_pool_cidrs as string[]) : [];
        const count = Math.max(1, Math.min(MAX_POOLS, cidrs.length || 1));
        setPoolsCount(count);
        const padded = [...cidrs];
        while (padded.length < count) padded.push("");
        setIpPoolCidrs(padded.slice(0, count));
      })
      .catch((e: unknown) => {
        const err = e as { status?: number; body?: unknown };
        setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
      })
      .finally(() => setLoading(false));
  }, [props.open, props.serverId]);

  async function testConnection() {
    setError(null);
    setTestResult(null);
    setTesting(true);
    try {
      if (props.serverId) {
        const res = await api.testServerConnection(Number(props.serverId), {
          host: host.trim() || undefined,
          port: port.trim() ? Number(port) : undefined,
          username: username.trim() || undefined,
          password: password.trim() || undefined,
          use_ssl: useSsl,
        }) as { ok?: boolean; error?: string };
        setTestResult(res?.ok ? { ok: true, message: "Conexión exitosa." } : { ok: false, message: res?.error || "Error desconocido" });
      } else {
        const res = await api.testConnectionInline({
          host: host.trim(),
          port: Number(port) || 8728,
          username: username.trim(),
          password: password.trim(),
          use_ssl: useSsl,
        }) as { ok?: boolean; error?: string };
        setTestResult(res?.ok ? { ok: true, message: "Conexión exitosa." } : { ok: false, message: res?.error || "Error desconocido" });
      }
    } catch (e: unknown) {
      const body = (e as { body?: { error?: string; message?: string }; status?: number })?.body ?? e;
      setTestResult({ ok: false, message: (body as { error?: string; message?: string })?.error || (body as { message?: string })?.message || String((e as { status?: number })?.status ?? "Error de red") });
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    setError(null);
    setTestResult(null);
    if (!name.trim()) {
      setError("Nombre es requerido.");
      return;
    }
    if (!host.trim()) {
      setError("Host es requerido.");
      return;
    }
    if (!username.trim()) {
      setError("Usuario es requerido.");
      return;
    }
    const isCreate = !props.serverId;
    if (isCreate && !password.trim()) {
      setError("Contraseña es requerida al crear.");
      return;
    }
    const cleanedCidrs = ipPoolCidrs
      .slice(0, poolsCount)
      .map((c) => c.trim())
      .filter((c) => !!c);
    const payload: {
      name: string;
      host: string;
      port: number;
      username: string;
      use_ssl: boolean;
      local_address: string;
      ip_pool_cidrs: string[];
      password?: string;
    } = {
      name: name.trim(),
      host: host.trim(),
      port: Number(port) || 8728,
      username: username.trim(),
      use_ssl: useSsl,
      local_address: localAddress.trim(),
      ip_pool_cidrs: cleanedCidrs,
    };
    if (password.trim()) payload.password = password.trim();
    try {
      if (isCreate) {
        await api.createServer(payload);
      } else {
        await api.updateServer(Number(props.serverId!), payload);
      }
      props.onSaved();
      props.onClose();
    } catch (e: unknown) {
      const body = (e as { status?: number; body?: { error?: string; id?: number; value?: string; max?: number; received?: number } })?.body ?? e;
      const err = e as { status?: number; body?: { error?: string; id?: number; value?: string; max?: number; received?: number } };
      const errCode = (body as { error?: string })?.error;
      if (err?.status === 409 && errCode === "name_already_exists") {
        setError(`El nombre ya existe (servidor #${(body as { id?: number })?.id}).`);
        return;
      }
      if (err?.status === 400 && errCode === "ip_pool_cidr_invalid") {
        setError(`CIDR inválido: ${(body as { value?: string })?.value || ""}. Ej: 10.0.0.0/24`);
        return;
      }
      if (err?.status === 400 && errCode === "ip_pool_cidrs_too_many") {
        setError(`Máximo ${(body as { max?: number })?.max ?? MAX_POOLS} pools por server.`);
        return;
      }
      setError(`${err?.status ?? ""} ${JSON.stringify(body)}`);
    }
  }

  function changePoolsCount(n: number) {
    const next = Math.max(1, Math.min(MAX_POOLS, n));
    setPoolsCount(next);
    const padded = [...ipPoolCidrs];
    while (padded.length < next) padded.push("");
    setIpPoolCidrs(padded.slice(0, next));
  }

  return (
    <Modal
      opened={props.open}
      onClose={props.onClose}
      title={props.serverId ? `Editar servidor #${props.serverId}` : "Agregar servidor"}
      size="lg"
    >
      {loading ? (
        <Stack gap="md">
          <Skeleton height={36} />
          <Skeleton height={36} />
          <Skeleton height={36} />
          <Skeleton height={36} />
        </Stack>
      ) : (
        <>
          {error ? (
            <Alert color="red" title="Error" mb="md">
              {error}
            </Alert>
          ) : null}
          {testResult ? (
            <Alert color={testResult.ok ? "green" : "red"} title={testResult.ok ? "OK" : "Error"} mb="md">
              {testResult.message}
            </Alert>
          ) : null}
          <Field label="Nombre" value={name} onChange={setName} placeholder="ej: MT-PPPOE-1" />
          <Grid>
            <Grid.Col span={{ base: 12, md: 8 }}><Field label="IP / Host" value={host} onChange={setHost} placeholder="ej: 10.0.0.1" /></Grid.Col>
            <Grid.Col span={{ base: 12, md: 4 }}><Field label="Puerto" value={port} onChange={setPort} placeholder="8728" /></Grid.Col>
          </Grid>
          <Grid>
            <Grid.Col span={6}><Field label="Usuario" value={username} onChange={setUsername} /></Grid.Col>
            <Grid.Col span={6}>
              <Field label="Contraseña" value={password} onChange={setPassword} type="password" placeholder="Dejar vacío para no cambiar" />
            </Grid.Col>
          </Grid>
          <Field
            label="Local address"
            value={localAddress}
            onChange={setLocalAddress}
            placeholder="ej: 10.10.0.1"
          />
          <Stack gap="xs" mt="sm">
            <Group justify="space-between" align="flex-end">
              <Text size="sm" fw={500}>Pools de IPs</Text>
              <NumberInput
                label="Cantidad"
                value={poolsCount}
                onChange={(v) => changePoolsCount(Number(v) || 1)}
                min={1}
                max={MAX_POOLS}
                w={120}
              />
            </Group>
            <Text size="xs" c="dimmed">
              Cargá uno o más rangos en formato CIDR. Las IPs se autoasignan recorriendo los pools en el orden listado.
            </Text>
            {Array.from({ length: poolsCount }).map((_, i) => (
              <Field
                key={i}
                label={`Pool ${i + 1} (CIDR)`}
                value={ipPoolCidrs[i] ?? ""}
                onChange={(v) =>
                  setIpPoolCidrs((prev) => {
                    const next = [...prev];
                    while (next.length <= i) next.push("");
                    next[i] = v;
                    return next.slice(0, poolsCount);
                  })
                }
                placeholder={i === 0 ? "ej: 10.0.0.0/24" : "ej: 10.0.1.0/24"}
              />
            ))}
          </Stack>
          <Checkbox label="Usar SSL" checked={useSsl} onChange={(e) => setUseSsl(e.currentTarget.checked)} mt="sm" />
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={props.onClose}>Cerrar</Button>
            <Button
              variant="info"
              onClick={testConnection}
              disabled={loading || testing || (!props.serverId && (!host.trim() || !username.trim() || !password.trim()))}
            >
              {testing ? "Probando..." : "Probar conexión"}
            </Button>
            <Button variant="primary" onClick={save} disabled={loading}>
              {props.serverId ? "Guardar" : "Crear servidor"}
            </Button>
          </Group>
        </>
      )}
    </Modal>
  );
}
