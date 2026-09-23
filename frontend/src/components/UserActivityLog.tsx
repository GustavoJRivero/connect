import React, { useEffect, useState } from "react";
import {
  ActionIcon,
  Alert,
  Code,
  Group,
  Pagination,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import { api } from "../api";
import { fmtDateTime } from "../datetime";
import { formatApiError } from "../format";
import { BadgeTone, Card, MutedBadge } from "../ui";

type Activity = {
  id: number;
  created_at: string;
  user_id: number | null;
  username: string | null;
  action: string;
  module: string | null;
  summary: string;
  method: string | null;
  path: string | null;
  status_code: number | null;
  ref_id: number | null;
  ip: string | null;
  user_agent: string | null;
  details: unknown;
};

const ACTION_TONES: Record<string, BadgeTone> = {
  CREATE: "green",
  UPDATE: "lilac",
  DELETE: "red",
  ACTION: "gray",
  LOGIN: "green",
  LOGIN_CODE_SENT: "gray",
  LOGIN_FAILED: "orange",
  LOGOUT: "gray",
  DENIED: "red",
};

const PAGE_SIZE = 50;

export function UserActivityLog() {
  const [items, setItems] = useState<Activity[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [meta, setMeta] = useState<{
    users: { id: number; username: string }[];
    modules: { id: string; label: string }[];
    actions: { id: string; label: string }[];
  } | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [module, setModule] = useState<string | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  async function load() {
    setError(null);
    try {
      const res = (await api.getUserActivity({
        user_id: userId ? Number(userId) : null,
        module,
        action,
        q,
        from: dateFrom,
        to: dateTo,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      })) as { items: Activity[]; total: number };
      setItems(res?.items ?? []);
      setTotal(res?.total ?? 0);
    } catch (e: unknown) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    api.getUserActivityMeta().then(setMeta).catch(() => setMeta(null));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, userId, module, action, q, dateFrom, dateTo]);

  const actionLabel = (id: string) => meta?.actions.find((a) => a.id === id)?.label ?? id;
  const moduleLabel = (id: string | null) => (id ? meta?.modules.find((m) => m.id === id)?.label ?? id : "—");
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const end = Math.min(total, (page - 1) * PAGE_SIZE + items.length);
  const resetPage = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <Stack gap="md">
      {error ? (
        <Alert color="red" title="Error" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}
      <Card
        title="Actividad de usuarios"
        headerRight={
          <Tooltip label="Recargar">
            <ActionIcon size="lg" variant="light" color="violet" onClick={() => void load()} aria-label="Recargar">
              <IconRefresh size={20} />
            </ActionIcon>
          </Tooltip>
        }
      >
        <SimpleGrid cols={{ base: 1, sm: 3, md: 6 }} spacing="sm" mb="md">
          <Select
            label="Usuario"
            placeholder="Todos"
            clearable
            searchable
            value={userId}
            onChange={resetPage(setUserId)}
            data={(meta?.users ?? []).map((u) => ({ value: String(u.id), label: u.username }))}
            size="sm"
          />
          <Select
            label="Sección"
            placeholder="Todas"
            clearable
            value={module}
            onChange={resetPage(setModule)}
            data={(meta?.modules ?? []).map((m) => ({ value: m.id, label: m.label }))}
            size="sm"
          />
          <Select
            label="Tipo"
            placeholder="Todos"
            clearable
            value={action}
            onChange={resetPage(setAction)}
            data={(meta?.actions ?? []).map((a) => ({ value: a.id, label: a.label }))}
            size="sm"
          />
          <TextInput
            label="Buscar"
            placeholder="acción, ruta o usuario…"
            value={q}
            onChange={(e) => resetPage(setQ)(e.currentTarget.value)}
            size="sm"
          />
          <TextInput label="Desde" type="date" value={dateFrom} onChange={(e) => resetPage(setDateFrom)(e.currentTarget.value)} size="sm" />
          <TextInput label="Hasta" type="date" value={dateTo} onChange={(e) => resetPage(setDateTo)(e.currentTarget.value)} size="sm" />
        </SimpleGrid>

        <Table.ScrollContainer minWidth={820}>
        <Table striped highlightOnHover withTableBorder withColumnBorders style={{ fontSize: "0.88em" }}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={150}>Fecha/hora</Table.Th>
              <Table.Th w={130}>Usuario</Table.Th>
              <Table.Th>Acción</Table.Th>
              <Table.Th w={120}>Tipo</Table.Th>
              <Table.Th w={150}>Sección</Table.Th>
              <Table.Th w={40} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {items.map((x) => (
              <React.Fragment key={x.id}>
                <Table.Tr style={{ cursor: "pointer" }} onClick={() => setExpanded(expanded === x.id ? null : x.id)}>
                  <Table.Td>
                    <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                      {fmtDateTime(x.created_at, { withSeconds: true }) || x.created_at}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={600}>{x.username || "—"}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{x.summary}</Text>
                  </Table.Td>
                  <Table.Td>
                    <MutedBadge tone={ACTION_TONES[x.action] ?? "gray"} size="sm">{actionLabel(x.action)}</MutedBadge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{moduleLabel(x.module)}</Text>
                  </Table.Td>
                  <Table.Td ta="center">
                    <Text size="xs" c="dimmed">{expanded === x.id ? "▲" : "▼"}</Text>
                  </Table.Td>
                </Table.Tr>
                {expanded === x.id ? (
                  <Table.Tr>
                    <Table.Td colSpan={6}>
                      <Paper p="sm" radius="sm" withBorder>
                        <Stack gap={6}>
                          <Group gap="lg">
                            {x.method && x.path ? (
                              <Text size="xs"><b>Ruta:</b> <Code>{`${x.method} ${x.path}`}</Code></Text>
                            ) : null}
                            {x.status_code ? <Text size="xs"><b>Resultado:</b> {x.status_code}</Text> : null}
                            {x.ip ? <Text size="xs"><b>IP:</b> {x.ip}</Text> : null}
                          </Group>
                          {x.user_agent ? <Text size="xs" c="dimmed">{x.user_agent}</Text> : null}
                          {x.details ? (
                            <Code block style={{ fontSize: "0.85em", whiteSpace: "pre-wrap" }}>
                              {JSON.stringify(x.details, null, 2)}
                            </Code>
                          ) : null}
                        </Stack>
                      </Paper>
                    </Table.Td>
                  </Table.Tr>
                ) : null}
              </React.Fragment>
            ))}
          </Table.Tbody>
        </Table>
        </Table.ScrollContainer>

        {!items.length && !error && !loading ? (
          <Text c="dimmed" ta="center" py="xl">Sin actividad registrada.</Text>
        ) : null}

        <Group justify="space-between" mt="md">
          <Text size="sm" c="dimmed">
            Mostrando <b>{start}</b>-<b>{end}</b> de <b>{total}</b>
          </Text>
          <Pagination value={page} onChange={setPage} total={totalPages} size="sm" />
        </Group>
      </Card>
    </Stack>
  );
}
