import React, { useEffect, useState } from "react";
import {
  Stack,
  Card,
  Title,
  Text,
  Badge,
  Group,
  Button,
  Alert,
  Skeleton,
  Divider,
  Table,
} from "@mantine/core";
import { api } from "../api";

type PortalInvoice = {
  id: number;
  status: string;
  total: string;
  paid_total: string;
  balance: string;
  issue_date: string | null;
  due_date: string | null;
  description: string | null;
  period_start: string | null;
  period_end: string | null;
};

type PortalMe = {
  full_name: string;
  connections: {
    id: number;
    plan_profile: string;
    status: string;
    service_address: string | null;
  }[];
};

export default function ClientInvoicesPage() {
  const [me, setMe] = useState<PortalMe | null>(null);
  const [pending, setPending] = useState<PortalInvoice[]>([]);
  const [paid, setPaid] = useState<PortalInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [meRes, invRes] = await Promise.all([
        api.getPortalMe() as Promise<PortalMe>,
        api.getPortalInvoices() as Promise<{ pending: PortalInvoice[]; paid: PortalInvoice[] }>,
      ]);
      setMe(meRes);
      setPending(invRes.pending ?? []);
      setPaid(invRes.paid ?? []);
    } catch (e: any) {
      setError(e?.body?.error ?? "Error al cargar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function payInvoice(inv: PortalInvoice) {
    setError(null);
    setPayingId(inv.id);
    try {
      const res = (await api.portalPay([inv.id])) as {
        init_point?: string;
        sandbox_init_point?: string;
      };
      const url = res.init_point || res.sandbox_init_point;
      if (url) window.location.href = url;
    } catch (e: any) {
      setError(e?.body?.detail ?? e?.body?.error ?? "Error al generar el link de pago");
    } finally {
      setPayingId(null);
    }
  }

  const connectionStatusColor = (status: string) =>
    status === "ACTIVE" ? "green" : status === "CUT" ? "red" : "gray";

  if (loading) {
    return (
      <Stack gap="md">
        <Skeleton height={80} radius="md" />
        <Skeleton height={120} radius="md" />
        <Skeleton height={200} radius="md" />
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      {error ? (
        <Alert color="red" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      {/* Resumen del servicio */}
      {me && me.connections.length > 0 ? (
        <Card withBorder radius="md" padding="md">
          <Title order={5} mb="xs">Mi servicio</Title>
          {me.connections.map((conn) => (
            <Group key={conn.id} justify="space-between" py={4}>
              <Text size="sm">
                {conn.plan_profile}
                {conn.service_address ? ` — ${conn.service_address}` : ""}
              </Text>
              <Badge color={connectionStatusColor(conn.status)} variant="light" size="sm">
                {conn.status === "ACTIVE" ? "Activo" : conn.status === "CUT" ? "Suspendido" : conn.status}
              </Badge>
            </Group>
          ))}
        </Card>
      ) : null}

      {/* Facturas pendientes */}
      <Card withBorder radius="md" padding="md">
        <Title order={5} mb="md">Facturas pendientes</Title>

        {pending.length === 0 ? (
          <Text c="dimmed" size="sm" ta="center" py="md">
            No tenés facturas pendientes. Estás al día!
          </Text>
        ) : (
          <Stack gap="sm">
            {pending.map((inv) => {
              const isOverdue = inv.due_date && new Date(inv.due_date) < new Date();
              return (
                <Card key={inv.id} withBorder radius="sm" padding="sm" bg={isOverdue ? "red.0" : undefined}>
                  <Group justify="space-between" wrap="nowrap">
                    <Stack gap={2}>
                      <Group gap="xs">
                        <Text size="sm" fw={600}>
                          {inv.description ?? (inv.period_start ? `Período ${inv.period_start} al ${inv.period_end}` : `Factura #${inv.id}`)}
                        </Text>
                        {isOverdue ? (
                          <Badge color="red" size="xs">Vencida</Badge>
                        ) : (
                          <Badge color="yellow" size="xs">Pendiente</Badge>
                        )}
                      </Group>
                      <Text size="xs" c="dimmed">
                        Vence: {inv.due_date ?? "—"} · Saldo: ${inv.balance}
                      </Text>
                    </Stack>
                    <Button
                      size="sm"
                      color="blue"
                      loading={payingId === inv.id}
                      onClick={() => payInvoice(inv)}
                    >
                      Pagar con Mercado Pago
                    </Button>
                  </Group>
                </Card>
              );
            })}
          </Stack>
        )}
      </Card>

      {/* Historial de facturas pagadas */}
      {paid.length > 0 ? (
        <Card withBorder radius="md" padding="md">
          <Title order={5} mb="md">Historial de pagos</Title>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Período / Concepto</Table.Th>
                <Table.Th>Total</Table.Th>
                <Table.Th>Fecha</Table.Th>
                <Table.Th>Estado</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {paid.map((inv) => (
                <Table.Tr key={inv.id}>
                  <Table.Td>
                    {inv.description ?? (inv.period_start ? `${inv.period_start} al ${inv.period_end}` : `#${inv.id}`)}
                  </Table.Td>
                  <Table.Td>${inv.total}</Table.Td>
                  <Table.Td>{inv.issue_date ?? "—"}</Table.Td>
                  <Table.Td>
                    <Badge color="green" variant="light" size="sm">Pagada</Badge>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      ) : null}
    </Stack>
  );
}
