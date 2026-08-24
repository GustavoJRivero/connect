import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { ServerEditModal } from "../components/ServerEditModal";
import { ConfirmDialog, ConfirmState } from "../components/ConfirmDialog";
import { formatApiError, jobStatusLabel } from "../format";
import { IconArrowLeft, IconPencil, IconRefresh, IconTrash, IconX } from "@tabler/icons-react";
import { fmtDateTime, fmtTime } from "../datetime";
import { Button, MutedBadge, jobStatusTone } from "../ui";
import {
  Group,
  Table,
  Alert,
  Stack,
  Text,
  Card,
  Title,
  Skeleton,
  ActionIcon,
  Tooltip,
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
  const [confirm, setConfirm] = useState<ConfirmState>(null);

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
      setError(formatApiError(e));
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
      setError(formatApiError(e));
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

  return (
    <Stack gap="md">
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
      {error ? (
        <Alert color="red" title="Error" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      {mode === "list" ? (
        <Card withBorder padding="lg" radius="md">
          <Card.Section withBorder inheritPadding py="sm">
            <Group justify="space-between">
              <Group gap="sm">
                <Title order={5}>Servidores PPPoE</Title>
                <MutedBadge tone="lilac" size="sm">{summary.total}</MutedBadge>
                {summary.totalPending ? (
                  <MutedBadge tone="yellow" size="sm">{summary.totalPending} pendientes</MutedBadge>
                ) : null}
              </Group>
              <Group gap="xs">
                <Button
                  variant="primaryLight"
                  onClick={() => {
                    setServerModalId(null);
                    setServerModalOpen(true);
                  }}
                >
                  Agregar servidor
                </Button>
                <Tooltip label="Recargar">
                  <ActionIcon size="lg" variant="light" color="violet" onClick={reload} aria-label="Recargar">
                    <IconRefresh size={20} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Group>
          </Card.Section>
          <Table.ScrollContainer minWidth={600} mt="md">
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Servidor</Table.Th>
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
                      {Array.from({ length: 5 }).map((_, j) => (
                        <Table.Td key={j}>
                          <Skeleton height={20} width="80%" />
                        </Table.Td>
                      ))}
                    </Table.Tr>
                  ))
                ) : items.length ? (
                  items.map((s) => (
                    <Table.Tr key={s.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/network/${s.id}`)}>
                      <Table.Td>
                        <Text size="sm" fw={600}>{s.name}</Text>
                        <Text size="xs" c="dimmed">{s.host}:{s.port}</Text>
                      </Table.Td>
                      <Table.Td>{s.username}</Table.Td>
                      <Table.Td>
                        {s.ip_pool_cidrs && s.ip_pool_cidrs.length > 0 ? (
                          <Stack gap={2}>
                            <Group gap={4} wrap="wrap">
                              {(s.ip_pool_cidrs ?? []).map((c) => (
                                <MutedBadge key={c} tone="gray" size="sm">{c}</MutedBadge>
                              ))}
                            </Group>
                            <MutedBadge
                              tone={Number(s.pool_available) > 0 ? "lilac" : "red"}
                              size="sm"
                            >
                              {Number(s.pool_assigned ?? 0)}/{Number(s.pool_total ?? 0)} usadas
                            </MutedBadge>
                          </Stack>
                        ) : (
                          <Text size="xs" c="dimmed">sin pool</Text>
                        )}
                      </Table.Td>
                      <Table.Td>{Number(s.pending_jobs) ?? 0}</Table.Td>
                      <Table.Td onClick={(e) => e.stopPropagation()}>
                        <Group gap={8} wrap="nowrap">
                          <Tooltip label="Editar">
                            <ActionIcon
                              size="lg"
                              variant="light"
                              color="violet"
                              aria-label="Editar"
                              onClick={() => {
                                setServerModalId(Number(s.id));
                                setServerModalOpen(true);
                              }}
                            >
                              <IconPencil size={18} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Eliminar">
                            <ActionIcon
                              size="lg"
                              variant="light"
                              color="red"
                              aria-label="Eliminar"
                              onClick={() => setConfirm({
                                title: `Eliminar servidor`,
                                message: `Se eliminará el servidor "${s.name}". Solo es posible si no tiene conexiones asociadas.`,
                                confirmLabel: "Eliminar servidor",
                                danger: true,
                                onConfirm: async () => {
                                  try {
                                    await api.deleteServer(Number(s.id));
                                    await reload();
                                  } catch (e: unknown) {
                                    setError(formatApiError(e));
                                  }
                                },
                              })}
                            >
                              <IconTrash size={18} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))
                ) : (
                  <Table.Tr>
                    <Table.Td colSpan={5}>
                      <Text c="dimmed" ta="center" py="lg">Sin servidores.</Text>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      ) : (
        <>
          <Card withBorder padding="lg" radius="md">
            <Card.Section withBorder inheritPadding py="sm">
              <Group justify="space-between">
                <Group gap="xs">
                  <Tooltip label="Volver">
                    <ActionIcon variant="subtle" color="gray" size="lg" onClick={() => navigate("/network")} aria-label="Volver">
                      <IconArrowLeft size={18} />
                    </ActionIcon>
                  </Tooltip>
                  <Title order={5}>{selected?.name ?? "Servidor"}</Title>
                </Group>
                <Group gap="xs">
                  <Button
                    variant="primaryLight"
                    onClick={() => serverId && testConnection(serverId)}
                    loading={testingConnection}
                  >
                    Probar conexión
                  </Button>
                  <Tooltip label="Editar">
                    <ActionIcon
                      size="lg"
                      variant="light"
                      color="violet"
                      aria-label="Editar"
                      onClick={() =>
                        serverId && (setServerModalId(Number(serverId)), setServerModalOpen(true))
                      }
                    >
                      <IconPencil size={18} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Recargar jobs">
                    <ActionIcon
                      size="lg"
                      variant="light"
                      color="violet"
                      aria-label="Recargar jobs"
                      onClick={() => serverId && reloadJobs(serverId)}
                    >
                      <IconRefresh size={20} />
                    </ActionIcon>
                  </Tooltip>
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
                      <MutedBadge key={c} tone="gray" size="sm">{c}</MutedBadge>
                    ))}
                    <MutedBadge tone="lilac" size="sm">
                      Asignadas: {Number(selected?.pool_assigned ?? 0)}
                    </MutedBadge>
                    <MutedBadge tone="green" size="sm">
                      Libres: {Number(selected?.pool_available ?? 0)}
                    </MutedBadge>
                    <MutedBadge tone="gray" size="sm">
                      Total: {Number(selected?.pool_total ?? 0)}
                    </MutedBadge>
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
                        setError(formatApiError(e));
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
                        {Array.from({ length: 7 }).map((_, j) => (
                          <Table.Td key={j}>
                            <Skeleton height={20} width="80%" />
                          </Table.Td>
                        ))}
                      </Table.Tr>
                    ))
                  ) : (
                    jobsSorted.map((j) => (
                      <Table.Tr key={j.id}>
                        <Table.Td>{fmtDateTime(j.created_at, { withSeconds: true }) || "-"}</Table.Td>
                        <Table.Td>{j.job_type}</Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            <MutedBadge size="sm" tone={jobStatusTone(j.status)}>
                              {jobStatusLabel(j.status)}
                            </MutedBadge>
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
                              ? `A las ${fmtTime(j.run_after)}`
                              : "En cola"
                            : j.status === "RUNNING"
                              ? j.locked_at
                                ? `Desde ${fmtTime(j.locked_at)}`
                                : "Ejecutando…"
                              : "-"}
                        </Table.Td>
                        <Table.Td>{j.attempts ?? 0}</Table.Td>
                        <Table.Td style={{ maxWidth: 380, whiteSpace: "pre-wrap" }}>{j.last_error ?? "-"}</Table.Td>
                        <Table.Td>
                          <Group gap={8} wrap="nowrap">
                            {j.status === "FAILED" || (j.status === "RUNNING" && isStuck(j)) ? (
                              <Tooltip label={j.status === "RUNNING" ? "Recuperar" : "Reintentar"}>
                                <ActionIcon
                                  size="lg"
                                  variant="light"
                                  color="violet"
                                  aria-label={j.status === "RUNNING" ? "Recuperar" : "Reintentar"}
                                  onClick={async () => {
                                    if (!serverId) return;
                                    try {
                                      await api.retryJob(Number(j.id));
                                      await reloadJobs(serverId);
                                    } catch (e: unknown) {
                                      setError(formatApiError(e));
                                    }
                                  }}
                                >
                                  <IconRefresh size={18} />
                                </ActionIcon>
                              </Tooltip>
                            ) : null}
                            {j.status === "PENDING" ? (
                              <Tooltip label="Cancelar">
                                <ActionIcon
                                  size="lg"
                                  variant="light"
                                  color="red"
                                  aria-label="Cancelar"
                                  onClick={() => {
                                    if (!serverId) return;
                                    setConfirm({
                                      title: "Cancelar job",
                                      message: "El job quedará cancelado y no se ejecutará en el Mikrotik.",
                                      confirmLabel: "Cancelar job",
                                      danger: true,
                                      onConfirm: async () => {
                                        try {
                                          await api.cancelJob(Number(j.id));
                                          await reloadJobs(serverId);
                                        } catch (e: unknown) {
                                          setError(formatApiError(e));
                                        }
                                      },
                                    });
                                  }}
                                >
                                  <IconX size={18} />
                                </ActionIcon>
                              </Tooltip>
                            ) : null}
                          </Group>
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
