import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { ServerEditModal } from "../components/ServerEditModal";
import { Button } from "../ui";
import {
  Group,
  Table,
  Alert,
  Badge,
  Stack,
  Text,
  Card,
  Title,
  Skeleton,
} from "@mantine/core";

type ServerRow = {
  id: number;
  name: string;
  host: string;
  port: number;
  username: string;
  pending_jobs?: number;
  local_address?: string;
  ip_pool_cidrs?: string[];
  pools_count?: number;
  pool_total?: number;
  pool_assigned?: number;
  pool_reserved?: number;
  pool_available?: number;
};

type JobRow = {
  id: number;
  created_at?: string;
  job_type: string;
  status: string;
  run_after?: string;
  locked_at?: string;
  attempts?: number;
  last_error?: string;
  payload_json?: string;
};

export default function NetworkPage() {
  const params = useParams();
  const navigate = useNavigate();
  const [items, setItems] = useState<ServerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serverModalOpen, setServerModalOpen] = useState(false);
  const [serverModalId, setServerModalId] = useState<number | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testMessage, setTestMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const serverId = params.serverId ? Number(params.serverId) : null;
  const mode = useMemo<"list" | "detail">(() => (serverId ? "detail" : "list"), [serverId]);
  const selected = serverId ? items.find((x) => Number(x.id) === serverId) : null;

  const summary = useMemo(() => {
    const total = items.length;
    const totalPending = items.reduce((acc, s) => acc + (Number(s.pending_jobs) || 0), 0);
    return { total, totalPending };
  }, [items]);

  const jobsSorted = useMemo(() => {
    const order = (a: { status: string; id: number }, b: { status: string; id: number }) => {
      const s = (x: string) => (x === "PENDING" ? 0 : x === "RUNNING" ? 1 : 2);
      if (s(a.status) !== s(b.status)) return s(a.status) - s(b.status);
      return Number(b.id) - Number(a.id);
    };
    return [...jobs].sort(order);
  }, [jobs]);

  const STUCK_MS = 35000;
  const isStuck = (j: { status: string; locked_at?: string }) =>
    j.status === "RUNNING" && j.locked_at && Date.now() - new Date(j.locked_at).getTime() > STUCK_MS;
  const stuckJobs = jobs.filter(isStuck);
  const hasStuck = stuckJobs.length > 0;

  async function reload() {
    setError(null);
    setLoading(true);
    try {
      const res = await api.listServers();
      setItems(Array.isArray(res) ? (res as ServerRow[]) : []);
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function reloadJobs(id: number) {
    setError(null);
    setJobsLoading(true);
    try {
      const res = await api.listServerJobs(id);
      setJobs(Array.isArray(res) ? (res as JobRow[]) : []);
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    } finally {
      setJobsLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    if (!serverId) return;
    reloadJobs(serverId);
  }, [serverId]);

  useEffect(() => {
    if (!serverId) return;
    const t = setInterval(() => reloadJobs(serverId), 5000);
    return () => clearInterval(t);
  }, [serverId]);

  async function testConnection(sid: number) {
    setTestMessage(null);
    setTestingConnection(true);
    try {
      const res = (await api.testServerConnection(sid)) as { ok?: boolean; error?: string };
      setTestMessage(
        res?.ok ? { ok: true, text: "Conexión exitosa." } : { ok: false, text: res?.error || "Error" }
      );
    } catch (e: unknown) {
      const err = e as { body?: { error?: string; message?: string } };
      setTestMessage({
        ok: false,
        text: err?.body?.error || err?.body?.message || "Error de red",
      });
    } finally {
      setTestingConnection(false);
    }
  }

  const jobStatusColor = (status: string) =>
    status === "DONE" ? "green" : status === "FAILED" ? "red" : status === "CANCELLED" ? "gray" : "yellow";

  return (
    <Stack gap="md">
      {error ? (
        <Alert color="red" className="sc-error" title="Error">
          {error}
        </Alert>
      ) : null}

      {mode === "list" ? (
        <>
          <Group justify="space-between" wrap="wrap" gap="sm">
            <Group gap="sm">
              <Text fw={600}>Resumen</Text>
              <Badge color="blue" variant="light">
                Servidores: {summary.total}
              </Badge>
              <Badge color="yellow" variant="light">
                Jobs pendientes: {summary.totalPending}
              </Badge>
            </Group>
            <Group>
              <Button
                variant="primary"
                onClick={() => {
                  setServerModalId(null);
                  setServerModalOpen(true);
                }}
              >
                Agregar servidor
              </Button>
              <Button variant="default" onClick={reload}>
                Recargar
              </Button>
            </Group>
          </Group>

          <Card withBorder padding="lg" radius="md">
            <Card.Section withBorder inheritPadding py="sm">
              <Title order={5}>Servidores PPPoE</Title>
            </Card.Section>
            <Table.ScrollContainer minWidth={600} mt="md">
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>ID</Table.Th>
                    <Table.Th>Nombre</Table.Th>
                    <Table.Th>Host</Table.Th>
                    <Table.Th>Usuario</Table.Th>
                    <Table.Th>Pool</Table.Th>
                    <Table.Th>Pendientes</Table.Th>
                    <Table.Th>Acciones</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <Table.Tr key={i}>
                        {Array.from({ length: 7 }).map((_, j) => (
                          <Table.Td key={j}>
                            <Skeleton height={20} width={j === 6 ? 140 : "80%"} />
                          </Table.Td>
                        ))}
                      </Table.Tr>
                    ))
                  ) : (
                    items.map((s) => (
                      <Table.Tr key={s.id}>
                        <Table.Td>#{s.id}</Table.Td>
                        <Table.Td>{s.name}</Table.Td>
                        <Table.Td>{s.host}:{s.port}</Table.Td>
                        <Table.Td>{s.username}</Table.Td>
                        <Table.Td>
                          {s.ip_pool_cidrs && s.ip_pool_cidrs.length > 0 ? (
                            <Stack gap={2}>
                              <Group gap={4} wrap="wrap">
                                {(s.ip_pool_cidrs ?? []).map((c) => (
                                  <Badge key={c} variant="light" color="gray" size="sm">{c}</Badge>
                                ))}
                              </Group>
                              <Badge
                                variant="light"
                                color={Number(s.pool_available) > 0 ? "blue" : "red"}
                                size="sm"
                              >
                                {Number(s.pool_assigned ?? 0)}/{Number(s.pool_total ?? 0)} usadas
                              </Badge>
                            </Stack>
                          ) : (
                            <Text size="xs" c="dimmed">sin pool</Text>
                          )}
                        </Table.Td>
                        <Table.Td>{Number(s.pending_jobs) ?? 0}</Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            <Button variant="default" onClick={() => navigate(`/network/${s.id}`)}>
                              Ver
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() => {
                                setServerModalId(Number(s.id));
                                setServerModalOpen(true);
                              }}
                            >
                              Editar
                            </Button>
                            <Button
                              variant="danger"
                              onClick={async () => {
                                if (!window.confirm("¿Eliminar servidor? (solo si no está en uso)")) return;
                                await api.deleteServer(Number(s.id));
                                await reload();
                              }}
                            >
                              Eliminar
                            </Button>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))
                  )}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            {!loading && !items.length ? (
              <Text c="dimmed" size="sm" p="md">
                Sin servidores. Agregá uno con el botón de arriba.
              </Text>
            ) : null}
          </Card>
        </>
      ) : (
        <>
          <Card withBorder padding="lg" radius="md">
            <Card.Section withBorder inheritPadding py="sm">
              <Group justify="space-between">
                <Title order={5}>Servidor PPPoE #{serverId}</Title>
                <Group gap="xs">
                  <Button variant="default" onClick={() => navigate("/network")}>
                    Volver
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      serverId && (setServerModalId(Number(serverId)), setServerModalOpen(true))
                    }
                  >
                    Editar
                  </Button>
                  <Button
                    variant="info"
                    onClick={() => serverId && testConnection(serverId)}
                    disabled={testingConnection}
                  >
                    {testingConnection ? "Probando..." : "Probar conexión"}
                  </Button>
                  <Button variant="default" onClick={() => serverId && reloadJobs(serverId)}>
                    Recargar jobs
                  </Button>
                </Group>
              </Group>
            </Card.Section>
            {testMessage ? (
              <Alert
                color={testMessage.ok ? "green" : "red"}
                mb="sm"
                title={testMessage.ok ? "OK" : "Error"}
              >
                <Text size="sm">{testMessage.text}</Text>
              </Alert>
            ) : null}
            <Stack gap="xs" mt="md">
              <Text size="sm" c="dimmed">
                Nombre: {selected?.name ?? "-"}
              </Text>
              <Text size="sm" c="dimmed">
                Host: {selected?.host ?? "-"}:{selected?.port ?? "-"}
              </Text>
              <Text size="sm" c="dimmed">
                Usuario: {selected?.username ?? "-"}
              </Text>
              <Text size="sm" c="dimmed">
                Local address: {selected?.local_address || "-"}
              </Text>
              <Group gap="xs" wrap="wrap">
                <Text size="sm" c="dimmed">Pools:</Text>
                {selected?.ip_pool_cidrs && selected.ip_pool_cidrs.length > 0 ? (
                  <>
                    {selected.ip_pool_cidrs.map((c) => (
                      <Badge key={c} variant="light" color="gray" size="sm">{c}</Badge>
                    ))}
                    <Badge variant="light" color="blue" size="sm">
                      Asignadas: {Number(selected?.pool_assigned ?? 0)}
                    </Badge>
                    <Badge variant="light" color="green" size="sm">
                      Libres: {Number(selected?.pool_available ?? 0)}
                    </Badge>
                    <Badge variant="light" color="gray" size="sm">
                      Total: {Number(selected?.pool_total ?? 0)}
                    </Badge>
                  </>
                ) : (
                  <Text size="sm" c="dimmed">sin pool configurado</Text>
                )}
              </Group>
            </Stack>
          </Card>

          <Card withBorder padding="lg" radius="md">
            <Card.Section withBorder inheritPadding py="sm">
              <Title order={5}>Cola de jobs</Title>
            </Card.Section>
            <Text size="sm" c="dimmed" mt="sm" mb="md">
              Se actualiza cada 5 segundos. Arriba: pendientes y en ejecución; abajo: terminados o cancelados.
            </Text>
            {hasStuck ? (
              <Alert color="yellow" mb="md" title="Jobs posiblemente colgados">
                <Group justify="space-between" wrap="wrap">
                  <Text size="sm">
                    {stuckJobs.length} job(s) en RUNNING hace más de 35 s.
                  </Text>
                  <Button
                    variant="warning"
                    onClick={async () => {
                      if (!serverId) return;
                      try {
                        const r = (await api.recoverStuckJobs(serverId)) as { count?: number };
                        if (r?.count) await reloadJobs(serverId);
                      } catch (e: unknown) {
                        const err = e as { status?: number; body?: unknown };
                        setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
                      }
                    }}
                  >
                    Recuperar colgados
                  </Button>
                </Group>
              </Alert>
            ) : null}
            <Table.ScrollContainer minWidth={700}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>ID</Table.Th>
                    <Table.Th>Fecha</Table.Th>
                    <Table.Th>Tipo</Table.Th>
                    <Table.Th>Estado</Table.Th>
                    <Table.Th>Cola</Table.Th>
                    <Table.Th>Intentos</Table.Th>
                    <Table.Th>Error</Table.Th>
                    <Table.Th>Acciones</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {jobsLoading && !jobs.length ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <Table.Tr key={i}>
                        {Array.from({ length: 8 }).map((_, j) => (
                          <Table.Td key={j}>
                            <Skeleton height={20} width="80%" />
                          </Table.Td>
                        ))}
                      </Table.Tr>
                    ))
                  ) : (
                    jobsSorted.map((j) => (
                      <Table.Tr key={j.id}>
                        <Table.Td>#{j.id}</Table.Td>
                        <Table.Td>{(j.created_at ?? "").slice(0, 19).replace("T", " ") || "-"}</Table.Td>
                        <Table.Td>{j.job_type}</Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            <Badge size="sm" color={jobStatusColor(j.status)} variant="light">
                              {j.status}
                            </Badge>
                            {isStuck(j) ? (
                              <Text span size="xs" c="yellow">
                                (colgado?)
                              </Text>
                            ) : null}
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          {j.status === "PENDING"
                            ? j.run_after
                              ? `A las ${String(j.run_after).slice(11, 19)}`
                              : "En cola"
                            : j.status === "RUNNING"
                              ? j.locked_at
                                ? `Desde ${String(j.locked_at).slice(11, 19)}`
                                : "Ejecutando…"
                              : "-"}
                        </Table.Td>
                        <Table.Td>{j.attempts ?? 0}</Table.Td>
                        <Table.Td style={{ maxWidth: 380, whiteSpace: "pre-wrap" }}>{j.last_error ?? "-"}</Table.Td>
                        <Table.Td>
                          {j.status === "FAILED" || (j.status === "RUNNING" && isStuck(j)) ? (
                            <Button
                              variant="primary"
                              onClick={async () => {
                                if (!serverId) return;
                                try {
                                  await api.retryJob(Number(j.id));
                                  await reloadJobs(serverId);
                                } catch (e: unknown) {
                                  const err = e as { status?: number; body?: unknown };
                                  setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
                                }
                              }}
                            >
                              {j.status === "RUNNING" ? "Recuperar" : "Reintentar"}
                            </Button>
                          ) : j.status === "PENDING" ? (
                            <Button
                              variant="danger"
                              onClick={async () => {
                                if (!serverId) return;
                                if (!window.confirm("¿Cancelar este job? No se ejecutará.")) return;
                                try {
                                  await api.cancelJob(Number(j.id));
                                  await reloadJobs(serverId);
                                } catch (e: unknown) {
                                  const err = e as { status?: number; body?: unknown };
                                  setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
                                }
                              }}
                            >
                              Cancelar
                            </Button>
                          ) : (
                            "-"
                          )}
                        </Table.Td>
                      </Table.Tr>
                    ))
                  )}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            {!jobsLoading && !jobs.length ? (
              <Text c="dimmed" size="sm" py="md">
                Sin jobs.
              </Text>
            ) : null}
          </Card>
        </>
      )}

      <ServerEditModal
        open={serverModalOpen}
        serverId={serverModalId}
        onClose={() => {
          setServerModalOpen(false);
          setServerModalId(null);
        }}
        onSaved={() => {
          reload();
        }}
      />
    </Stack>
  );
}
