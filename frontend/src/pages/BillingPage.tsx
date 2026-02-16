import React, { useState } from "react";
import { api } from "../api";
import { Button, Card, Field } from "../ui";
import { Grid, Checkbox, Alert } from "@mantine/core";

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
    <Grid>
      <Grid.Col span={{ base: 12, lg: 6 }}>
        <Card title="Generación de facturas (por conexión)">
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
            mt="sm"
          />
          <Button variant="primary" onClick={generate}>
            Generar
          </Button>
        </Card>
      </Grid.Col>

      <Grid.Col span={{ base: 12, lg: 6 }}>
        <Card title="Corte / reconexión automático">
          <p style={{ color: "var(--mantine-color-dimmed)", marginBottom: 12 }}>
            Evalúa facturas vencidas impagas y aplica CUT/RESTORE en Mikrotik.
          </p>
          <Button variant="danger" onClick={enforce}>
            Ejecutar enforce
          </Button>
        </Card>
      </Grid.Col>

      {error ? (
        <Grid.Col span={12}>
          <Alert color="red" className="sc-error">
            {error}
          </Alert>
        </Grid.Col>
      ) : null}
    </Grid>
  );
}
