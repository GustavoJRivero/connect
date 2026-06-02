import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Button, Card } from "../ui";
import {
  Stack,
  Alert,
  Badge,
  Group,
  Select,
  TextInput,
  Table,
  Text,
  Code,
  Collapse,
  Switch,
  Paper,
  SimpleGrid,
  Pagination,
  ActionIcon,
  Tooltip,
} from "@mantine/core";

const LEVEL_COLORS: Record<string, string> = {
  DEBUG: "gray",
  INFO: "cyan",
  WARNING: "yellow",
  ERROR: "red",
};

const MODULE_COLORS: Record<string, string> = {
  BILLING: "blue",
  CLIENT: "green",
  CONNECTION: "cyan",
  PAYMENT: "yellow",
  INVOICE: "gray",
  NETWORK: "dark",
  AUTH: "red",
  SYSTEM: "violet",
};

export default function LogsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [error, setError] = useState<string | null>(null);

  const [filterModule, setFilterModule] = useState<string | null>(null);
  const [filterLevel, setFilterLevel] = useState<string | null>(null);
  const [filterQ, setFilterQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [config, setConfig] = useState<any>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [modules, setModules] = useState<any[]>([]);

  async function loadLogs() {
    setError(null);
    try {
      const offset = Math.max(0, (page - 1) * pageSize);
      const res = await api.getLogs({
        module: filterModule || undefined,
        level: filterLevel || undefined,
        q: filterQ || undefined,
        from: dateFrom || undefined,
        to: dateTo || undefined,
        limit: pageSize,
        offset,
      });
      setItems(res?.items ?? []);
      setTotal(res?.total ?? 0);
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    }
  }

  async function loadConfig() {
    try {
      const res = await api.getLoggingConfig();
      setConfig(res);
    } catch {
      // ignore
    }
  }

  async function loadModules() {
    try {
      const res = await api.getLogModules();
      setModules(res ?? []);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadModules();
    loadConfig();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => loadLogs(), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filterModule, filterLevel, filterQ, dateFrom, dateTo]);

  async function toggleMaster() {
    if (!config) return;
    const next = !config.enabled;
    await api.updateLoggingConfig({ enabled: next });
    await loadConfig();
  }

  async function toggleModule(moduleId: string, current: boolean) {
    await api.updateLoggingConfig({ modules: { [moduleId]: !current } });
    await loadConfig();
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(total, (page - 1) * pageSize + items.length);

  return (
    <Stack gap="md">
      {error ? (
        <Alert color="red" title="Error" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      <Card
        title="Logs del sistema"
        headerRight={
          <Group gap="xs">
            {config ? (
              <Badge
                color={config.enabled ? "green" : "red"}
                variant="filled"
                size="lg"
                style={{ cursor: "pointer" }}
                onClick={toggleMaster}
              >
                {config.enabled ? "Logging activo" : "Logging desactivado"}
              </Badge>
            ) : null}
            <Tooltip label="Configuración de logging">
              <ActionIcon
                variant={showConfig ? "filled" : "light"}
                color="blue"
                onClick={() => setShowConfig(!showConfig)}
              >
                ⚙️
              </ActionIcon>
            </Tooltip>
            <Button variant="default" onClick={loadLogs}>
              Recargar
            </Button>
          </Group>
        }
      >
        {/* Panel de configuración colapsable */}
        <Collapse in={showConfig && !!config}>
          <Paper withBorder p="md" mb="md" radius="sm">
            <Group justify="space-between" mb="sm">
              <Text fw={600} size="sm">Configuración de logging por módulo</Text>
              <Switch
                label="Master"
                checked={config?.enabled ?? false}
                onChange={toggleMaster}
              />
            </Group>
            <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="xs">
              {(config?.modules ?? []).map((m: any) => (
                <Switch
                  key={m.module}
                  label={
                    <Group gap={4}>
                      <Badge color={MODULE_COLORS[m.module] ?? "gray"} variant="light" size="xs">
                        {m.module}
                      </Badge>
                      <Text size="xs">{m.label}</Text>
                    </Group>
                  }
                  checked={m.enabled}
                  onChange={() => toggleModule(m.module, m.enabled)}
                  disabled={!config?.enabled}
                  size="sm"
                />
              ))}
            </SimpleGrid>
            <Text size="xs" c="dimmed" mt="sm">
              Los módulos desactivados no registrarán nuevos logs en la base de datos (siguen en consola).
            </Text>
          </Paper>
        </Collapse>

        {/* Filtros */}
        <SimpleGrid cols={{ base: 1, sm: 2, md: 5 }} spacing="sm" mb="md">
          <Select
            label="Módulo"
            placeholder="Todos"
            clearable
            value={filterModule}
            onChange={(v) => { setFilterModule(v); setPage(1); }}
            data={modules.map((m: any) => ({ value: m.id, label: m.label }))}
            size="sm"
          />
          <Select
            label="Nivel"
            placeholder="Todos"
            clearable
            value={filterLevel}
            onChange={(v) => { setFilterLevel(v); setPage(1); }}
            data={[
              { value: "DEBUG", label: "DEBUG" },
              { value: "INFO", label: "INFO" },
              { value: "WARNING", label: "WARNING" },
              { value: "ERROR", label: "ERROR" },
            ]}
            size="sm"
          />
          <TextInput
            label="Buscar"
            placeholder="texto en mensaje..."
            value={filterQ}
            onChange={(e) => { setFilterQ(e.currentTarget.value); setPage(1); }}
            size="sm"
          />
          <TextInput
            label="Desde"
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.currentTarget.value); setPage(1); }}
            size="sm"
          />
          <TextInput
            label="Hasta"
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.currentTarget.value); setPage(1); }}
            size="sm"
          />
        </SimpleGrid>

        {/* Tabla de logs */}
        <Table striped highlightOnHover withTableBorder withColumnBorders style={{ fontSize: "0.88em" }}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={155}>Fecha/hora</Table.Th>
              <Table.Th w={75}>Nivel</Table.Th>
              <Table.Th w={110}>Módulo</Table.Th>
              <Table.Th w={160}>Acción</Table.Th>
              <Table.Th>Mensaje</Table.Th>
              <Table.Th w={40} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {items.map((log: any) => (
              <React.Fragment key={log.id}>
                <Table.Tr
                  style={{
                    cursor: log.details ? "pointer" : "default",
                    backgroundColor:
                      log.level === "ERROR"
                        ? "var(--mantine-color-red-0)"
                        : log.level === "WARNING"
                        ? "var(--mantine-color-yellow-0)"
                        : undefined,
                  }}
                  onClick={() => {
                    if (log.details) setExpanded(expanded === log.id ? null : log.id);
                  }}
                >
                  <Table.Td>
                    <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                      {log.created_at ? formatDateTime(log.created_at) : "-"}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={LEVEL_COLORS[log.level] ?? "gray"} variant="filled" size="sm">
                      {log.level}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={MODULE_COLORS[log.module] ?? "gray"} variant="light" size="sm">
                      {log.module}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Code style={{ fontSize: "0.85em" }}>{log.action}</Code>
                  </Table.Td>
                  <Table.Td>{log.message}</Table.Td>
                  <Table.Td ta="center">
                    {log.details ? (
                      <Text size="xs" c="dimmed">
                        {expanded === log.id ? "▲" : "▼"}
                      </Text>
                    ) : null}
                  </Table.Td>
                </Table.Tr>
                {expanded === log.id && log.details ? (
                  <Table.Tr>
                    <Table.Td colSpan={6}>
                      <Paper p="sm" radius="sm" withBorder>
                        <Table withColumnBorders style={{ fontSize: "0.85em" }}>
                          <Table.Tbody>
                            {Object.entries(log.details).map(([k, v]) => (
                              <Table.Tr key={k}>
                                <Table.Td w={180} fw={600}>{k}</Table.Td>
                                <Table.Td><Code>{String(v)}</Code></Table.Td>
                              </Table.Tr>
                            ))}
                          </Table.Tbody>
                        </Table>
                        {log.ref_type ? (
                          <Text size="xs" c="dimmed" mt="xs">
                            Ref: {log.ref_type} #{log.ref_id}
                          </Text>
                        ) : null}
                      </Paper>
                    </Table.Td>
                  </Table.Tr>
                ) : null}
              </React.Fragment>
            ))}
          </Table.Tbody>
        </Table>

        {!items.length && !error ? (
          <Text c="dimmed" ta="center" py="xl">
            Sin logs registrados.
          </Text>
        ) : null}

        {/* Paginación */}
        <Group justify="space-between" mt="md">
          <Text size="sm" c="dimmed">
            Mostrando <b>{start}</b>-<b>{end}</b> de <b>{total}</b>
          </Text>
          <Pagination
            value={page}
            onChange={setPage}
            total={totalPages}
            size="sm"
          />
        </Group>
      </Card>
    </Stack>
  );
}

import { fmtDateTime as _fmtDateTime } from "../datetime";

function formatDateTime(iso: string): string {
  if (!iso) return "-";
  return _fmtDateTime(iso, { withSeconds: true }) || iso;
}
