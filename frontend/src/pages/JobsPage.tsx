import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { Button } from "../ui";
import {
  Alert,
  Badge,
  Card,
  Code,
  Collapse,
  Group,
  Loader,
  Pagination,
  Select,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
  ActionIcon,
} from "@mantine/core";

interface JobRow {
  id: number;
  created_at: string | null;
  status: string;
  job_type: string;
  server_id: number | null;
  attempts: number;
  run_after: string | null;
  locked_at: string | null;
  finished_at: string | null;
  payload: Record<string, unknown>;
  result: unknown;
  last_error: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: "yellow",
  RUNNING: "blue",
  DONE: "green",
  FAILED: "red",
  CANCELLED: "gray",
};

const PAGE_SIZE = 30;

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function duration(created: string | null, finished: string | null): string {
  if (!created || !finished) return "—";
  const ms = new Date(finished).getTime() - new Date(created).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [jobTypes, setJobTypes] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<number | null>(null);

  const loadTypes = useCallback(async () => {
    try {
      const types = (await api.getJobTypes()) as string[];
      setJobTypes(types);
    } catch {
      /* ignore */
    }
  }, []);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = (await api.listJobs({
        job_type: filterType || undefined,
        status: filterStatus || undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      })) as { items: JobRow[]; total: number };
      setJobs(res.items);
      setTotal(res.total);
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    } finally {
      setLoading(false);
    }
  }, [filterType, filterStatus, page]);

  useEffect(() => {
    loadTypes();
  }, [loadTypes]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    setPage(1);
  }, [filterType, filterStatus]);

  const handleRetry = async (id: number) => {
    try {
      await api.retryJob(id);
      loadJobs();
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`Retry error: ${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    }
  };

  const handleCancel = async (id: number) => {
    try {
      await api.cancelJob(id);
      loadJobs();
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`Cancel error: ${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <Stack gap="md">
      {error && (
        <Alert color="red" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card withBorder padding="lg" radius="md">
        <Group justify="space-between" mb="md">
          <Group>
            <Select
              placeholder="Tipo de job"
              clearable
              data={jobTypes.map((t) => ({ value: t, label: t }))}
              value={filterType}
              onChange={setFilterType}
              w={240}
            />
            <Select
              placeholder="Estado"
              clearable
              data={[
                { value: "PENDING", label: "Pendiente" },
                { value: "RUNNING", label: "En ejecución" },
                { value: "DONE", label: "Completado" },
                { value: "FAILED", label: "Fallido" },
                { value: "CANCELLED", label: "Cancelado" },
              ]}
              value={filterStatus}
              onChange={setFilterStatus}
              w={180}
            />
          </Group>
          <Group>
            <Text size="sm" c="dimmed">
              {total} job{total !== 1 ? "s" : ""}
            </Text>
            <Button variant="default" onClick={loadJobs}>
              Recargar
            </Button>
          </Group>
        </Group>

        {loading ? (
          <Group justify="center" py="xl">
            <Loader />
          </Group>
        ) : jobs.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            No hay jobs para mostrar.
          </Text>
        ) : (
          <>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>ID</Table.Th>
                  <Table.Th>Tipo</Table.Th>
                  <Table.Th>Estado</Table.Th>
                  <Table.Th>Creado</Table.Th>
                  <Table.Th>Finalizado</Table.Th>
                  <Table.Th>Duración</Table.Th>
                  <Table.Th>Intentos</Table.Th>
                  <Table.Th>Acciones</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {jobs.map((j) => (
                  <React.Fragment key={j.id}>
                    <Table.Tr
                      style={{ cursor: "pointer" }}
                      onClick={() => setExpandedId(expandedId === j.id ? null : j.id)}
                    >
                      <Table.Td>
                        <Text size="sm" fw={500}>
                          #{j.id}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light" size="sm">
                          {j.job_type}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Badge color={STATUS_COLORS[j.status] ?? "gray"} size="sm">
                          {j.status}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs">{fmtDate(j.created_at)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs">{fmtDate(j.finished_at)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs">{duration(j.created_at, j.finished_at)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs">{j.attempts}</Text>
                      </Table.Td>
                      <Table.Td onClick={(e) => e.stopPropagation()}>
                        <Group gap={4}>
                          {(j.status === "FAILED" || j.status === "RUNNING") && (
                            <Tooltip label="Reintentar">
                              <ActionIcon
                                variant="light"
                                color="blue"
                                size="sm"
                                onClick={() => handleRetry(j.id)}
                              >
                                🔄
                              </ActionIcon>
                            </Tooltip>
                          )}
                          {j.status === "PENDING" && (
                            <Tooltip label="Cancelar">
                              <ActionIcon
                                variant="light"
                                color="red"
                                size="sm"
                                onClick={() => handleCancel(j.id)}
                              >
                                ✕
                              </ActionIcon>
                            </Tooltip>
                          )}
                        </Group>
                      </Table.Td>
                    </Table.Tr>

                    {expandedId === j.id && (
                      <Table.Tr>
                        <Table.Td colSpan={8} style={{ padding: 0 }}>
                          <Collapse in={expandedId === j.id}>
                            <Stack gap="xs" p="md" style={{ background: "var(--mantine-color-dark-7, #f8f9fa)" }}>
                              <Group gap="lg">
                                <div>
                                  <Text size="xs" fw={600} c="dimmed">
                                    Server ID
                                  </Text>
                                  <Text size="sm">{j.server_id ?? "—"}</Text>
                                </div>
                                <div>
                                  <Text size="xs" fw={600} c="dimmed">
                                    Programado para
                                  </Text>
                                  <Text size="sm">{fmtDate(j.run_after)}</Text>
                                </div>
                                <div>
                                  <Text size="xs" fw={600} c="dimmed">
                                    Bloqueado
                                  </Text>
                                  <Text size="sm">{fmtDate(j.locked_at)}</Text>
                                </div>
                              </Group>

                              <div>
                                <Text size="xs" fw={600} c="dimmed" mb={4}>
                                  Payload
                                </Text>
                                <Code block style={{ maxHeight: 200, overflow: "auto" }}>
                                  {JSON.stringify(j.payload, null, 2)}
                                </Code>
                              </div>

                              {j.result != null && (
                                <div>
                                  <Text size="xs" fw={600} c="dimmed" mb={4}>
                                    Resultado
                                  </Text>
                                  <Code block color="green" style={{ maxHeight: 200, overflow: "auto" }}>
                                    {JSON.stringify(j.result, null, 2)}
                                  </Code>
                                </div>
                              )}

                              {j.last_error && (
                                <div>
                                  <Text size="xs" fw={600} c="dimmed" mb={4}>
                                    Último error
                                  </Text>
                                  <Code block color="red" style={{ maxHeight: 200, overflow: "auto" }}>
                                    {j.last_error}
                                  </Code>
                                </div>
                              )}
                            </Stack>
                          </Collapse>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </React.Fragment>
                ))}
              </Table.Tbody>
            </Table>

            {totalPages > 1 && (
              <Group justify="center" mt="md">
                <Pagination total={totalPages} value={page} onChange={setPage} />
              </Group>
            )}
          </>
        )}
      </Card>
    </Stack>
  );
}
