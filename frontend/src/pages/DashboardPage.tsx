import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Grid,
  Card,
  Title,
  Text,
  Group,
  ThemeIcon,
  Table,
  Stack,
  Alert,
  SimpleGrid,
  Skeleton,
  Anchor,
  Box,
  Divider,
  Badge,
  Paper,
} from "@mantine/core";
import { api } from "../api";

type DashboardData = {
  clients?: { total?: number };
  connections?: { active?: number; cut?: number };
  invoices?: { overdue?: number };
  payments?: { today_total?: number; today_count?: number };
  jobs?: { pending?: number };
  recent_payments?: {
    id: number;
    client_id: number;
    client_name?: string;
    amount: string;
    created_by?: { username: string };
    created_at: string;
  }[];
  today?: string;
} | null;

type PaymentRow = {
  id: number;
  client_id: number;
  client_name?: string;
  amount: string;
  created_by?: { username: string };
  created_at: string;
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .getDashboardSummary()
      .then((d: unknown) => {
        if (!alive) return;
        setData(d as DashboardData);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        const err = e as { status?: number; body?: unknown };
        setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
      });
    return () => {
      alive = false;
    };
  }, []);

  const fmtMoney = useMemo(() => {
    const nf = new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 2,
    });
    return (raw: unknown) => {
      const n = Number(raw ?? 0);
      return nf.format(Number.isFinite(n) ? n : 0);
    };
  }, []);

  const d = data;
  const loading = !d && !error;

  const stats = {
    clientes: d?.clients?.total ?? "—",
    activos: d?.connections?.active ?? "—",
    cortados: d?.connections?.cut ?? "—",
    vencidas: d?.invoices?.overdue ?? "—",
    cobranzaHoy: fmtMoney(d?.payments?.today_total ?? 0),
    pagosHoy: d?.payments?.today_count ?? "—",
    pendientes: d?.jobs?.pending ?? "—",
  };

  const fmtDateTime = (iso: unknown) => {
    if (!iso) return "—";
    const date = new Date(String(iso));
    if (Number.isNaN(date.getTime())) return String(iso);
    return date.toLocaleString("es-AR");
  };

  const recentPayments: PaymentRow[] = d?.recent_payments ?? [];

  const statCards = [
    {
      label: "Clientes",
      value: stats.clientes,
      icon: "👥",
      color: "blue" as const,
      to: "/clients",
      linkLabel: "Ver clientes",
    },
    {
      label: "Conexiones activas",
      value: stats.activos,
      icon: "📶",
      color: "green" as const,
      to: "/clients",
      linkLabel: "Ver conexiones",
    },
    {
      label: "Facturas vencidas",
      value: stats.vencidas,
      icon: "📄",
      color: "yellow" as const,
      to: "/invoices",
      linkLabel: "Ver facturas",
      badge: Number(d?.invoices?.overdue ?? 0) > 0,
    },
    {
      label: "Cortados",
      value: stats.cortados,
      icon: "⛔",
      color: "red" as const,
      to: "/clients",
      linkLabel: "Ver cortes",
      badge: Number(d?.connections?.cut ?? 0) > 0,
    },
  ];

  const quickLinks = [
    { to: "/billing", label: "Cobranza", description: "Generar facturas y gestionar cobros", color: "blue" },
    { to: "/payments", label: "Pagos", description: "Registrar y consultar pagos", color: "green" },
    { to: "/invoices", label: "Facturas", description: "Listado y emisión de facturas", color: "cyan" },
    { to: "/network", label: "Red", description: "Estado de servidores y jobs", color: "orange" },
    { to: "/settings", label: "Configuración", description: "Planes, perfiles y parámetros", color: "gray" },
  ];

  return (
    <Stack gap="md">
      {error ? (
        <Alert color="red" className="sc-error" title="Error">
          {error}
        </Alert>
      ) : null}

      <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }} spacing="md">
        {statCards.map((card) => (
          <Anchor
            key={card.label}
            component={Link}
            to={card.to}
            underline="never"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <Card
              withBorder
              padding="lg"
              radius="md"
              style={{ cursor: "pointer", transition: "box-shadow 0.2s, transform 0.2s" }}
              className="sc-dashboard-stat-card"
            >
              {loading ? (
                <>
                  <Group justify="space-between">
                    <Skeleton height={14} width={80} />
                    <Skeleton height={40} width={40} circle />
                  </Group>
                  <Skeleton height={32} width={60} mt="sm" />
                  <Skeleton height={12} width={90} mt="xs" />
                </>
              ) : (
                <>
                  <Group justify="space-between" wrap="nowrap">
                    <Box>
                      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                        {card.label}
                      </Text>
                      <Group gap="xs" align="baseline" mt={4}>
                        <Title order={3}>{card.value}</Title>
                        {card.badge ? (
                          <Badge size="sm" color={card.color} variant="light">
                            Atención
                          </Badge>
                        ) : null}
                      </Group>
                    </Box>
                    <ThemeIcon size="xl" variant="light" color={card.color}>
                      {card.icon}
                    </ThemeIcon>
                  </Group>
                  <Text size="sm" c="dimmed" mt="xs">
                    {card.linkLabel} →
                  </Text>
                </>
              )}
            </Card>
          </Anchor>
        ))}
      </SimpleGrid>

      <Grid>
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Card withBorder padding="lg" radius="md">
            <Card.Section withBorder inheritPadding py="sm">
              <Title order={5}>Resumen del día</Title>
            </Card.Section>
            {loading ? (
              <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="md" mt="md">
                {[1, 2, 3].map((i) => (
                  <Group key={i} wrap="nowrap">
                    <Skeleton height={40} width={40} circle />
                    <Box>
                      <Skeleton height={12} width={70} />
                      <Skeleton height={20} width={50} mt={4} />
                    </Box>
                  </Group>
                ))}
              </SimpleGrid>
            ) : (
              <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="lg" mt="md">
                <Group wrap="nowrap">
                  <ThemeIcon size="lg" variant="light" color="blue">
                    $
                  </ThemeIcon>
                  <Box>
                    <Text size="xs" c="dimmed">
                      Cobranza hoy
                    </Text>
                    <Text fw={700} size="lg">
                      {stats.cobranzaHoy}
                    </Text>
                  </Box>
                </Group>
                <Group wrap="nowrap">
                  <ThemeIcon size="lg" variant="light" color="green">
                    ✓
                  </ThemeIcon>
                  <Box>
                    <Text size="xs" c="dimmed">
                      Pagos imputados
                    </Text>
                    <Text fw={700} size="lg">
                      {stats.pagosHoy}
                    </Text>
                  </Box>
                </Group>
                <Group wrap="nowrap">
                  <ThemeIcon size="lg" variant="light" color="yellow">
                    ⏱
                  </ThemeIcon>
                  <Box>
                    <Text size="xs" c="dimmed">
                      Jobs pendientes
                    </Text>
                    <Text fw={700} size="lg">
                      {stats.pendientes}
                    </Text>
                  </Box>
                </Group>
              </SimpleGrid>
            )}
            {d?.today ? (
              <Text size="xs" c="dimmed" mt="md">
                Actualizado: <strong>{d.today}</strong>
              </Text>
            ) : null}
          </Card>

          <Card withBorder padding={0} radius="md" mt="md">
            <Card.Section withBorder inheritPadding py="sm">
              <Group justify="space-between">
                <Title order={5}>Últimas transacciones (pagos)</Title>
                <Anchor component={Link} to="/payments" size="sm">
                  Ver todos →
                </Anchor>
              </Group>
            </Card.Section>
            <Table.ScrollContainer minWidth={400}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Cliente</Table.Th>
                    <Table.Th ta="end">Monto</Table.Th>
                    <Table.Th>Usuario</Table.Th>
                    <Table.Th>Fecha/Hora</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <Table.Tr key={i}>
                        <Table.Td><Skeleton height={20} width="80%" /></Table.Td>
                        <Table.Td><Skeleton height={20} width={60} /></Table.Td>
                        <Table.Td><Skeleton height={20} width={70} /></Table.Td>
                        <Table.Td><Skeleton height={20} width={100} /></Table.Td>
                      </Table.Tr>
                    ))
                  ) : recentPayments.length ? (
                    recentPayments.map((p) => (
                      <Table.Tr key={p.id}>
                        <Table.Td>
                          <Anchor
                            component={Link}
                            to={`/clients/${p.client_id}`}
                            size="sm"
                            style={{ maxWidth: 320, display: "block", overflow: "hidden", textOverflow: "ellipsis" }}
                          >
                            {p.client_name || `#${p.client_id}`}
                          </Anchor>
                        </Table.Td>
                        <Table.Td ta="end" fw={600}>
                          {fmtMoney(p.amount)}
                        </Table.Td>
                        <Table.Td>{p?.created_by?.username || "—"}</Table.Td>
                        <Table.Td>{fmtDateTime(p.created_at)}</Table.Td>
                      </Table.Tr>
                    ))
                  ) : (
                    <Table.Tr>
                      <Table.Td colSpan={4} c="dimmed" py="xl" ta="center">
                        Sin pagos registrados todavía.
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Paper withBorder p="lg" radius="md">
            <Title order={5} mb="md">
              Accesos rápidos
            </Title>
            {loading ? (
              <Stack gap="xs">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} height={44} radius="sm" />
                ))}
              </Stack>
            ) : (
              <Stack gap={0}>
                {quickLinks.map((link, idx) => (
                  <Box key={link.to}>
                    {idx > 0 ? <Divider mb="sm" /> : null}
                    <Anchor
                      component={Link}
                      to={link.to}
                      size="sm"
                      fw={600}
                      c={link.color}
                    >
                      {link.label}
                    </Anchor>
                    <Text size="xs" c="dimmed" mt={2}>
                      {link.description}
                    </Text>
                  </Box>
                ))}
              </Stack>
            )}
          </Paper>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
