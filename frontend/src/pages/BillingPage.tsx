import React, { useState } from "react";
import { api } from "../api";
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
  } from "@mantine/core";

export default function BillingPage() {
  const [issueDate, setIssueDate] = useState("");
  const [issue, setIssue] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setError(null);
    try {
      const payload: { issue?: boolean; issue_date?: string } = { issue };
      if (issueDate) payload.issue_date = issueDate;
      await api.generateBilling(payload);
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    }
  }

  async function enforce() {
    setError(null);
    try {
      await api.enforceBilling({});
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    }
  }

  return (
    <Stack gap="md">
      {error ? (
        <Alert color="red" className="sc-error" title="Error">
          {error}
        </Alert>
      ) : null}

      <Grid>
        <Grid.Col span={{ base: 12, lg: 6 }}>
          <Card withBorder padding="lg" radius="md">
            <Card.Section withBorder inheritPadding py="sm">
              <Title order={5}>Generación de facturas (por conexión)</Title>
            </Card.Section>
            <Stack gap="md" mt="md">
              <Field
                label="Fecha de emisión (opcional YYYY-MM-DD)"
                value={issueDate}
                onChange={setIssueDate}
                placeholder="2026-01-31"
              />
              <Checkbox
                label="Emitir directamente (ISSUED)"
                checked={issue}
                onChange={(e) => setIssue(e.currentTarget.checked)}
              />
              <Group>
                <Button variant="primary" onClick={generate}>
                  Generar
                </Button>
              </Group>
            </Stack>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 6 }}>
          <Card withBorder padding="lg" radius="md">
            <Card.Section withBorder inheritPadding py="sm">
              <Title order={5}>Corte / reconexión automático</Title>
            </Card.Section>
            <Stack gap="md" mt="md">
              <Text size="sm" c="dimmed">
                Evalúa facturas vencidas impagas y aplica CUT/RESTORE en Mikrotik.
              </Text>
              <Button variant="danger" onClick={enforce}>
                Ejecutar enforce
              </Button>
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
