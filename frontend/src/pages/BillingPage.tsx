import React, { useEffect, useState } from "react";
import { api } from "../api";
import { fmtDateTime } from "../datetime";
import { Button, Field } from "../ui";
import {
  Grid,
  Checkbox,
  Alert,
  Card,
  Title,
  Text,
  Stack,
  Group,
  Badge,
  SimpleGrid,
  Paper,
  Loader,
  Center,
} from "@mantine/core";

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
  const [issueDate, setIssueDate] = useState("");
  const [issue, setIssue] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generateResult, setGenerateResult] = useState<{ created: number; errors: any[] } | null>(null);
  const [updateResult, setUpdateResult] = useState<{ cut: number[]; restored: number[] } | null>(null);

  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  async function loadStatus() {
    setStatusLoading(true);
    try {
      const res = await api.getBillingStatus();
      setStatus(res as BillingStatus);
    } catch {
      // ignore
    } finally {
      setStatusLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function generate() {
    setError(null);
    setGenerateResult(null);
    try {
      const payload: { issue?: boolean; issue_date?: string } = { issue };
      if (issueDate) payload.issue_date = issueDate;
      const res = await api.generateBilling(payload);
      setGenerateResult(res as { created: number; errors: any[] });
      await loadStatus();
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    }
  }

  async function updateServices() {
    setError(null);
    setUpdateResult(null);
    try {
      const res = await api.updateServices();
      setUpdateResult(res as { cut: number[]; restored: number[] });
      await loadStatus();
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    }
  }

  return (
    <Stack gap="md">
      {error ? (
        <Alert color="red" title="Error" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      {/* Panel de estado */}
      <Card withBorder padding="lg" radius="md">
        <Card.Section withBorder inheritPadding py="sm">
          <Group justify="space-between">
            <Title order={5}>Estado de facturación</Title>
            <Group gap="xs">
              {status ? (
                <Badge color={status.mode === "INDIVIDUAL" ? "violet" : "blue"} variant="filled" size="lg">
                  Modo {status.mode}
                </Badge>
              ) : null}
              <Button variant="default" onClick={loadStatus}>
                Actualizar
              </Button>
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
                  <Text size="xl" fw={700} c="blue">{status.active_connections}</Text>
                  <Text size="xs" c="dimmed">Conexiones activas</Text>
                </Paper>
                <Paper withBorder p="md" radius="sm" ta="center">
                  <Text size="xl" fw={700} c="red">{status.cut_connections}</Text>
                  <Text size="xs" c="dimmed">Conexiones cortadas</Text>
                </Paper>
                <Paper withBorder p="md" radius="sm" ta="center">
                  <Text size="xl" fw={700} c="orange">{status.overdue_invoices}</Text>
                  <Text size="xs" c="dimmed">Facturas vencidas impagas</Text>
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
                      <Badge size="sm" color={status.last_run.status === "COMPLETED" ? "green" : status.last_run.status === "FAILED" ? "red" : "yellow"}>
                        {status.last_run.status}
                      </Badge>
                      <Badge size="sm" variant="light">{status.last_run.trigger}</Badge>
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
            </Stack>
          ) : (
            <Text c="dimmed">No se pudo cargar el estado.</Text>
          )}
        </Card.Section>
      </Card>

      {/* Acciones */}
      <Grid>
        <Grid.Col span={{ base: 12, lg: 6 }}>
          <Card withBorder padding="lg" radius="md">
            <Card.Section withBorder inheritPadding py="sm">
              <Title order={5}>Generación de facturas</Title>
            </Card.Section>
            <Stack gap="md" mt="md">
              <Text size="sm" c="dimmed">
                Genera facturas para todas las conexiones activas del período actual.
              </Text>
              <Field
                label="Fecha de emisión (opcional)"
                value={issueDate}
                onChange={setIssueDate}
                placeholder="YYYY-MM-DD (vacío = hoy)"
              />
              <Checkbox
                label="Emitir directamente (ISSUED)"
                checked={issue}
                onChange={(e) => setIssue(e.currentTarget.checked)}
              />
              <Group>
                <Button variant="primary" onClick={generate}>
                  Generar facturas
                </Button>
              </Group>
              {generateResult ? (
                <Alert color={generateResult.errors.length > 0 ? "yellow" : "green"} title="Resultado">
                  <Text size="sm">Facturas creadas: {generateResult.created}</Text>
                  {generateResult.errors.length > 0 ? (
                    <Text size="sm" c="red">Errores: {generateResult.errors.length}</Text>
                  ) : null}
                </Alert>
              ) : null}
            </Stack>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 6 }}>
          <Card withBorder padding="lg" radius="md">
            <Card.Section withBorder inheritPadding py="sm">
              <Title order={5}>Actualizar estado de servicios</Title>
            </Card.Section>
            <Stack gap="md" mt="md">
              <Text size="sm" c="dimmed">
                Revisa facturas vencidas impagas y actualiza el estado de las conexiones (corte / restauración).
              </Text>
              <Button variant="danger" onClick={updateServices}>
                Actualizar servicios
              </Button>
              {updateResult ? (
                <Alert color="blue" title="Resultado">
                  <Text size="sm">Cortadas: {updateResult.cut.length} | Restauradas: {updateResult.restored.length}</Text>
                </Alert>
              ) : null}
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
