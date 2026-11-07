import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ActionIcon, Alert, Checkbox, Group, Pagination, Paper, Select, Skeleton, Table, Text, TextInput, Tooltip } from "@mantine/core";
import { IconPlugConnectedX, IconRefresh, IconRestore } from "@tabler/icons-react";
import { api, ConnectionListItem } from "../api";
import { useCan } from "../auth";
import { connectionStatusLabel, formatApiError } from "../format";
import { notifySuccess } from "../notify";
import { Button, Card, MutedBadge, connectionStatusTone } from "../ui";
import { ConfirmDialog, ConfirmState } from "./ConfirmDialog";
import { DebtAmount, DebtFilter, DEBT_FILTER_OPTIONS } from "./DebtAmount";

type SortCol = "id" | "client" | "plan" | "status" | "server" | "debt";

type StatusFilter = "all" | "ACTIVE" | "CUT";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todos los estados" },
  { value: "ACTIVE", label: "Activas" },
  { value: "CUT", label: "Cortadas" },
];

export function ConnectionsList() {
  const navigate = useNavigate();
  const can = useCan();
  const canEdit = can("clients", "edit");

  const [items, setItems] = useState<ConnectionListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [debt, setDebt] = useState<DebtFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortBy, setSortBy] = useState<SortCol>("debt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  // La selección sobrevive al cambio de página/filtros para armar lotes grandes.
  const [selected, setSelected] = useState<Map<number, ConnectionListItem>>(new Map());
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  async function reload() {
    setError(null);
    setLoading(true);
    try {
      const res = await api.listConnections({
        q,
        status,
        debt,
        limit: pageSize,
        offset: (page - 1) * pageSize,
        sort_by: sortBy,
        sort_dir: sortDir,
      });
      setItems(res.items ?? []);
      setTotal(Number(res.total ?? 0));
    } catch (e: unknown) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => reload(), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, debt, page, pageSize, sortBy, sortDir]);

  function toggleSort(col: SortCol) {
    if (sortBy === col) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir(col === "debt" ? "desc" : "asc"); }
    setPage(1);
  }

  function SortTh(props: { col: SortCol; children: React.ReactNode }) {
    const active = sortBy === props.col;
    return (
      <Table.Th
        style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
        aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
        onClick={() => toggleSort(props.col)}
      >
        {props.children} {active ? (sortDir === "asc" ? "▲" : "▼") : null}
      </Table.Th>
    );
  }

  function toggleOne(x: ConnectionListItem) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(x.id)) next.delete(x.id);
      else next.set(x.id, x);
      return next;
    });
  }

  const pageAllSelected = items.length > 0 && items.every((x) => selected.has(x.id));
  const pageSomeSelected = items.some((x) => selected.has(x.id));

  function togglePage() {
    setSelected((prev) => {
      const next = new Map(prev);
      if (pageAllSelected) items.forEach((x) => next.delete(x.id));
      else items.forEach((x) => next.set(x.id, x));
      return next;
    });
  }

  const selectedList = Array.from(selected.values());
  const toCut = selectedList.filter((x) => x.status !== "CUT");
  const toRestore = selectedList.filter((x) => x.status === "CUT");

  function bulkCut() {
    const ids = toCut.map((x) => x.id);
    setConfirm({
      title: `Cortar ${ids.length} ${ids.length === 1 ? "conexión" : "conexiones"}`,
      message: `Los servicios seleccionados quedarán suspendidos en el Mikrotik y esos clientes se quedarán sin internet. Se pueden restaurar en cualquier momento.`,
      confirmLabel: "Cortar servicios",
      danger: true,
      onConfirm: async () => {
        try {
          const res = await api.bulkCutConnections(ids, "suspended");
          notifySuccess(`${res.updated} ${res.updated === 1 ? "conexión cortada" : "conexiones cortadas"}.`);
          setSelected(new Map());
          await reload();
        } catch (e: unknown) {
          setError(formatApiError(e));
        }
      },
    });
  }

  function bulkRestore() {
    const ids = toRestore.map((x) => x.id);
    setConfirm({
      title: `Restaurar ${ids.length} ${ids.length === 1 ? "conexión" : "conexiones"}`,
      message: "Se vuelve a aplicar el plan contratado en el Mikrotik a las conexiones cortadas seleccionadas.",
      confirmLabel: "Restaurar servicios",
      onConfirm: async () => {
        try {
          const res = await api.bulkRestoreConnections(ids);
          notifySuccess(`${res.updated} ${res.updated === 1 ? "conexión restaurada" : "conexiones restauradas"}.`);
          setSelected(new Map());
          await reload();
        } catch (e: unknown) {
          setError(formatApiError(e));
        }
      },
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(total, (page - 1) * pageSize + items.length);
  const colCount = canEdit ? 7 : 6;

  return (
    <Card
      footer={
        <Group justify="space-between">
          <Text>Mostrando <b>{start}</b>-<b>{end}</b> de <b>{total}</b></Text>
          <Pagination total={totalPages} value={page} onChange={setPage} withEdges />
        </Group>
      }
    >
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />

      <Group align="flex-end" mb="md" wrap="wrap">
        <TextInput
          placeholder="cliente, dni, usuario PPPoE, IP, domicilio..."
          value={q}
          onChange={(e) => { setQ(e.currentTarget.value); setPage(1); }}
          style={{ minWidth: 260 }}
        />
        <Select
          value={status}
          onChange={(v) => { setStatus((v ?? "all") as StatusFilter); setPage(1); }}
          data={STATUS_OPTIONS}
          allowDeselect={false}
          style={{ width: 170 }}
          aria-label="Filtrar por estado"
        />
        <Select
          value={debt}
          onChange={(v) => { setDebt((v ?? "all") as DebtFilter); setPage(1); }}
          data={DEBT_FILTER_OPTIONS}
          allowDeselect={false}
          style={{ width: 170 }}
          aria-label="Filtrar por saldo"
        />
        <Select
          value={String(pageSize)}
          onChange={(v) => { setPageSize(Number(v ?? 50)); setPage(1); }}
          data={["25", "50", "100", "200"]}
          style={{ width: 100 }}
          aria-label="Filas por página"
        />
        <Tooltip label="Recargar">
          <ActionIcon size="lg" variant="light" color="violet" onClick={reload} aria-label="Recargar">
            <IconRefresh size={20} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {canEdit && selected.size > 0 ? (
        <Paper withBorder p="sm" mb="md" radius="md">
          <Group justify="space-between" wrap="wrap">
            <Text size="sm">
              <b>{selected.size}</b> {selected.size === 1 ? "conexión seleccionada" : "conexiones seleccionadas"}
            </Text>
            <Group gap="xs">
              <Button variant="danger" disabled={!toCut.length} onClick={bulkCut}>
                <Group gap={6} wrap="nowrap"><IconPlugConnectedX size={16} />Cortar servicio ({toCut.length})</Group>
              </Button>
              <Button variant="primaryLight" disabled={!toRestore.length} onClick={bulkRestore}>
                <Group gap={6} wrap="nowrap"><IconRestore size={16} />Restaurar ({toRestore.length})</Group>
              </Button>
              <Button variant="default" onClick={() => setSelected(new Map())}>Limpiar selección</Button>
            </Group>
          </Group>
        </Paper>
      ) : null}

      {error ? <Alert color="red" title="Error" mb="md" withCloseButton onClose={() => setError(null)}>{error}</Alert> : null}

      <Table.ScrollContainer minWidth={820}>
        <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              {canEdit ? (
                <Table.Th style={{ width: 40 }}>
                  <Checkbox
                    checked={pageAllSelected}
                    indeterminate={!pageAllSelected && pageSomeSelected}
                    onChange={togglePage}
                    aria-label="Seleccionar página"
                  />
                </Table.Th>
              ) : null}
              <SortTh col="client">Cliente</SortTh>
              <Table.Th>Usuario / IP</Table.Th>
              <SortTh col="plan">Plan</SortTh>
              <SortTh col="server">Servidor</SortTh>
              <SortTh col="debt">Saldo</SortTh>
              <SortTh col="status">Estado</SortTh>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Table.Tr key={i}>
                  {Array.from({ length: colCount }).map((_, j) => (
                    <Table.Td key={j}><Skeleton height={20} width="75%" /></Table.Td>
                  ))}
                </Table.Tr>
              ))
            ) : items.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={colCount}>
                  <Text c="dimmed" ta="center" py="lg">No se encontraron conexiones con esos filtros.</Text>
                </Table.Td>
              </Table.Tr>
            ) : items.map((x) => (
              <Table.Tr
                key={x.id}
                style={{ cursor: "pointer" }}
                bg={selected.has(x.id) ? "var(--mantine-color-violet-light)" : undefined}
                onClick={() => navigate(`/clients/${x.client_id}`)}
              >
                {canEdit ? (
                  <Table.Td onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected.has(x.id)} onChange={() => toggleOne(x)} aria-label={`Seleccionar conexión #${x.id}`} />
                  </Table.Td>
                ) : null}
                <Table.Td>
                  <Text fw={600} size="sm" truncate>{x.client_name}</Text>
                  <Text size="xs" c="dimmed" truncate>
                    {[`Conexión #${x.id}`, x.service_address?.trim() || null].filter(Boolean).join(" · ")}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{x.pppoe_name}</Text>
                  <Text size="xs" c="dimmed">{x.ip || "IP automática"}</Text>
                </Table.Td>
                <Table.Td><MutedBadge tone="lilac" size="sm">{x.plan_profile}</MutedBadge></Table.Td>
                <Table.Td><Text size="sm" c={x.server_name ? undefined : "dimmed"}>{x.server_name || "—"}</Text></Table.Td>
                <Table.Td><DebtAmount value={x.debt_total} creditValue={x.credit_balance} /></Table.Td>
                <Table.Td>
                  <MutedBadge tone={connectionStatusTone(x.status)}>{connectionStatusLabel(x.status)}</MutedBadge>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Card>
  );
}
