import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { fmtDateTime } from "../datetime";
import { formatApiError } from "../format";
import { MutedBadge, jobStatusTone } from "../ui";
import {
  Alert,
  Card,
  Title,
  Text,
  Stack,
  Group,
  SimpleGrid,
  Paper,
  Loader,
  Center,
  Anchor,
  ActionIcon,
  Tooltip,
} from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";

interface BillingStatus {
  mode: string;
  global_day: number;
  due_days: number;
  active_connections: number;
  cut_connections: number;
  overdue_invoices: number;
  draft_invoices: number;
  last_run: {
    id: number;
    billing_date: string;
    trigger: string;
    status: string;
    invoices_created: number;
    invoices_skipped: number;
    errors_count: number;
    created_at: string | null;
  } | null;
}

export default function BillingPage() {
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  async function loadStatus() {
    setStatusLoading(true);
    try {
      const res = await api.getBillingStatus();
      setStatus(res as BillingStatus);
    } catch (e: unknown) {
      setError(formatApiError(e));
    } finally {
      setStatusLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  return (
    <Stack gap="md">
      {error ? (
        <Alert color="red" title="Error" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      <Card withBorder padding="lg" radius="md">
        <Card.Section withBorder inheritPadding py="sm">
          <Group justify="space-between">
            <Title order={5}>Estado de facturación</Title>
            <Group gap="xs">
              {status ? (
                <MutedBadge tone="lilac" size="lg">
                  Modo {status.mode}
                </MutedBadge>
              ) : null}
              <Tooltip label="Actualizar">
                <ActionIcon size="lg" variant="light" color="violet" onClick={loadStatus} aria-label="Actualizar">
                  <IconRefresh size={20} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
        </Card.Section>
        <Card.Section inheritPadding py="md">
          {statusLoading ? (
            <Center py="md"><Loader size="sm" /></Center>
          ) : status ? (
            <Stack gap="md">
              <SimpleGrid cols={{ base: 2, sm: 4 }}>
                <Paper withBorder p="md" radius="sm" ta="center">
                  <Text size="xl" fw={700} c="violet">{status.active_connections}</Text>
                  <Text size="xs" c="dimmed">Conexiones activas</Text>
                </Paper>
                <Paper withBorder p="md" radius="sm" ta="center">
                  <Text size="xl" fw={700} c="red">{status.cut_connections}</Text>
                  <Text size="xs" c="dimmed">Conexiones cortadas</Text>
                </Paper>
                <Paper withBorder p="md" radius="sm" ta="center">
                  <Text size="xl" fw={700} c="orange">{status.overdue_invoices}</Text>
                  <Text size="xs" c="dimmed">Facturas vencidas pendientes</Text>
                </Paper>
                <Paper withBorder p="md" radius="sm" ta="center">
                  <Text size="xl" fw={700} c="gray">{status.draft_invoices}</Text>
                  <Text size="xs" c="dimmed">Facturas borrador</Text>
                </Paper>
              </SimpleGrid>

              <Group gap="lg">
                <Text size="sm">
                  <Text span fw={500}>Día de facturación: </Text>
                  {status.mode === "GLOBAL"
                    ? `día ${status.global_day} de cada mes (global)`
                    : "individual por conexión"}
                </Text>
                <Text size="sm">
                  <Text span fw={500}>Vencimiento: </Text>
                  {status.due_days} días después de emitida
                </Text>
              </Group>

              {status.last_run ? (
                <Paper withBorder p="sm" radius="sm">
                  <Group justify="space-between">
                    <Group gap="xs">
                      <Text size="sm" fw={500}>Última ejecución:</Text>
                      <MutedBadge size="sm" tone={jobStatusTone(status.last_run.status)}>
                        {status.last_run.status}
                      </MutedBadge>
                      <MutedBadge size="sm" tone="gray">{status.last_run.trigger}</MutedBadge>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {status.last_run.created_at ? fmtDateTime(status.last_run.created_at) : "-"}
                    </Text>
                  </Group>
                  <Text size="xs" c="dimmed" mt={4}>
                    Fecha: {status.last_run.billing_date} | Creadas: {status.last_run.invoices_created} | Omitidas: {status.last_run.invoices_skipped} | Errores: {status.last_run.errors_count}
                  </Text>
                </Paper>
              ) : (
                <Text size="sm" c="dimmed">No hay ejecuciones de facturación registradas.</Text>
              )}

              <Text size="sm" c="dimmed">
                La generación de facturas y la actualización de servicios están en{" "}
                <Anchor component={Link} to="/settings" size="sm">Configuración → Automatización</Anchor>.
              </Text>
            </Stack>
          ) : (
            <Text c="dimmed">No se pudo cargar el estado.</Text>
          )}
        </Card.Section>
      </Card>
    </Stack>
  );
}
