import React, { useEffect, useState } from "react";
import { Modal, Grid, Alert, Group, Checkbox } from "@mantine/core";
import { api } from "../api";
import { Button, Field } from "../ui";

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
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .getServer(Number(props.serverId))
      .then((s: unknown) => {
        const x = s as { name?: string; host?: string; port?: number; username?: string; use_ssl?: boolean };
        setName(String(x?.name ?? ""));
        setHost(String(x?.host ?? ""));
        setPort(String(x?.port ?? "8728"));
        setUsername(String(x?.username ?? ""));
        setPassword("");
        setUseSsl(Boolean(x?.use_ssl ?? false));
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
    const payload: { name: string; host: string; port: number; username: string; use_ssl: boolean; password?: string } = {
      name: name.trim(),
      host: host.trim(),
      port: Number(port) || 8728,
      username: username.trim(),
      use_ssl: useSsl,
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
      const body = (e as { status?: number; body?: { error?: string; id?: number } })?.body ?? e;
      const err = e as { status?: number; body?: { error?: string; id?: number } };
      if (err?.status === 409 && (body as { error?: string })?.error === "name_already_exists") {
        setError(`El nombre ya existe (servidor #${(body as { id?: number })?.id}).`);
        return;
      }
      setError(`${err?.status ?? ""} ${JSON.stringify(body)}`);
    }
  }

  return (
    <Modal
      opened={props.open}
      onClose={props.onClose}
      title={props.serverId ? `Editar servidor #${props.serverId}` : "Agregar servidor"}
      size="lg"
    >
      {loading ? (
        <div>Cargando...</div>
      ) : (
        <>
          {error ? <Alert color="red" mb="md">{error}</Alert> : null}
          {testResult ? (
            <Alert color={testResult.ok ? "green" : "red"} mb="md">
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
