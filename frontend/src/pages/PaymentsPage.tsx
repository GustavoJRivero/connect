import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Button, MutedBadge } from "../ui";
import { ClientSelect } from "../components/ClientSelect";
import { PaymentModal } from "../components/PaymentModal";
import { formatApiError, fmtMoney, paymentMethodLabel, todayISO, firstOfMonthISO, lastOfMonthISO } from "../format";
import { fmtDate } from "../datetime";
import { notifySuccess } from "../notify";
import {
  Grid,
  Table,
  Alert,
  Card,
  Title,
  Group,
  TextInput,
  Skeleton,
  Anchor,
  Stack,
  ActionIcon,
  Tooltip,
  SegmentedControl,
} from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";

type PaymentRow = {
  id: number;
  paid_at?: string;
  client_id: number;
  client_name?: string;
  created_by?: { username: string };
  amount: string;
  method?: string;
  allocations?: { invoice_id: number }[];
};

type RangePreset = "today" | "month" | "year" | "all";

export default function PaymentsPage() {
  const [items, setItems] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [range, setRange] = useState<RangePreset>("all");
  const [filterClientId, setFilterClientId] = useState("");

  function applyRange(preset: RangePreset) {
    setRange(preset);
    if (preset === "today") {
      const d = todayISO();
      setFrom(d);
      setTo(d);
    } else if (preset === "month") {
      setFrom(firstOfMonthISO());
      setTo(lastOfMonthISO());
    } else if (preset === "year") {
      const y = todayISO().slice(0, 4);
      setFrom(`${y}-01-01`);
      setTo(`${y}-12-31`);
    } else {
      setFrom("");
      setTo("");
    }
  }

  async function reload() {
    setError(null);
    setLoading(true);
    try {
      const res = await api.listPayments(filterClientId ? Number(filterClientId) : undefined, {
        from: from || undefined,
        to: to || undefined,
      });
      setItems(Array.isArray(res) ? (res as PaymentRow[]) : []);
    } catch (e: unknown) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, filterClientId]);

  return (
    <Stack gap="md">
      <PaymentModal
        open={showNew}
        onClose={() => setShowNew(false)}
        onSaved={async () => {
          setShowNew(false);
          notifySuccess("Pago registrado correctamente.");
          await reload();
        }}
      />

      {error ? (
        <Alert color="red" title="Error" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      <Card withBorder padding="lg" radius="md">
        <Card.Section withBorder inheritPadding py="sm">
          <Group justify="space-between">
            <Title order={5}>Pagos</Title>
            <Group gap="xs">
              <Button variant="primaryLight" onClick={() => setShowNew(true)}>
                Registrar pago
              </Button>
              <Tooltip label="Recargar">
                <ActionIcon size="lg" variant="light" color="violet" onClick={reload} aria-label="Recargar">
                  <IconRefresh size={20} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
        </Card.Section>

        <Grid mt="md" align="flex-end">
          <Grid.Col span={{ base: 12, md: 5 }}>
            <ClientSelect label="Filtrar por cliente" clearable value={filterClientId} onChange={setFilterClientId} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 7 }}>
            <SegmentedControl
              fullWidth
              color="violet"
              value={range}
              onChange={(v) => applyRange(v as RangePreset)}
              data={[
                { value: "today", label: "Hoy" },
                { value: "month", label: "Este mes" },
                { value: "year", label: "Este año" },
                { value: "all", label: "Todos" },
              ]}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 6, md: 3 }}>
            <TextInput
              label="Desde"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.currentTarget.value)}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 6, md: 3 }}>
            <TextInput
              label="Hasta"
              type="date"
              value={to}
              onChange={(e) => setTo(e.currentTarget.value)}
            />
          </Grid.Col>
        </Grid>

        <Table.ScrollContainer minWidth={720} mt="md">
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>ID</Table.Th>
                <Table.Th>Fecha</Table.Th>
                <Table.Th>Cliente</Table.Th>
                <Table.Th>Monto</Table.Th>
                <Table.Th>Medio</Table.Th>
                <Table.Th>Facturas</Table.Th>
                <Table.Th>Usuario</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <Table.Tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <Table.Td key={j}><Skeleton height={20} width="75%" /></Table.Td>
                    ))}
                  </Table.Tr>
                ))
              ) : items.length ? (
                items.map((p) => (
                  <Table.Tr key={p.id}>
                    <Table.Td>#{p.id}</Table.Td>
                    <Table.Td>{fmtDate(p.paid_at) || "-"}</Table.Td>
                    <Table.Td>
                      <Anchor component={Link} to={`/clients/${p.client_id}`} size="sm">
                        {p.client_name || `#${p.client_id}`}
                      </Anchor>
                    </Table.Td>
                    <Table.Td fw={600}>{fmtMoney(p.amount)}</Table.Td>
                    <Table.Td>
                      <MutedBadge tone="gray" size="sm">{paymentMethodLabel(p.method)}</MutedBadge>
                    </Table.Td>
                    <Table.Td>
                      {(p.allocations ?? []).map((a) => `#${a.invoice_id}`).join(", ") || "-"}
                    </Table.Td>
                    <Table.Td>{p.created_by?.username ?? "-"}</Table.Td>
                  </Table.Tr>
                ))
              ) : (
                <Table.Tr>
                  <Table.Td colSpan={7} c="dimmed" py="xl" ta="center">
                    No hay pagos en el rango seleccionado.
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
    </Stack>
  );
}
