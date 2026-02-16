import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Button, Field } from "../ui";
import { Grid, Alert, Card, Title, Stack, Group, SimpleGrid } from "@mantine/core";

const PLAN_KEYS = ["25M", "50M", "100M", "300M"];

export default function SettingsPage() {
  const [issuer, setIssuer] = useState<{ cuit?: string; point_of_sale?: number } | null>(null);
  const [plans, setPlans] = useState<Record<string, string>>({});
  const [billing, setBilling] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cuit, setCuit] = useState("");
  const [pointOfSale, setPointOfSale] = useState("");

  async function reload() {
    setError(null);
    setLoading(true);
    try {
      const res = (await api.getIssuer()) as { cuit?: string; point_of_sale?: number };
      setIssuer(res);
      setCuit(String(res?.cuit ?? ""));
      setPointOfSale(String(res?.point_of_sale ?? ""));

      const planRes = (await api.getSettings("plan.price.")) as Record<string, string>;
      const nextPlans: Record<string, string> = {};
      for (const k of PLAN_KEYS) nextPlans[k] = String(planRes[`plan.price.${k}`] ?? "");
      setPlans(nextPlans);

      const billRes = (await api.getSettings("billing.")) as Record<string, string>;
      const dueDays = String(billRes["billing.due_days"] ?? "10");
      const mtRes = (await api.getSettings("mikrotik.")) as Record<string, string>;
      const cutProfile = String(mtRes["mikrotik.cut_profile"] ?? "suspended");
      setBilling({ due_days: dueDays, cut_profile: cutProfile });
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function save() {
    setError(null);
    try {
      await api.putIssuer({ cuit, point_of_sale: Number(pointOfSale) });
      await reload();
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    }
  }

  async function savePlans() {
    setError(null);
    try {
      const values: Record<string, string> = {};
      for (const k of PLAN_KEYS) values[`plan.price.${k}`] = plans[k] ?? "";
      await api.putSettings(values);
      await reload();
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    }
  }

  async function saveBilling() {
    setError(null);
    try {
      await api.putSettings({
        "billing.due_days": billing.due_days ?? "10",
        "mikrotik.cut_profile": billing.cut_profile ?? "suspended",
      });
      await reload();
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
              <Group justify="space-between">
                <Title order={5}>Emisor (AFIP)</Title>
                <Group gap="xs">
                  <Button variant="primary" onClick={save}>
                    Guardar
                  </Button>
                  <Button variant="default" onClick={reload}>
                    Recargar
                  </Button>
                </Group>
              </Group>
            </Card.Section>
            <Stack gap="md" mt="md">
              <Field label="CUIT" value={cuit} onChange={setCuit} />
              <Field label="Punto de venta" value={pointOfSale} onChange={setPointOfSale} />
            </Stack>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 6 }}>
          <Card withBorder padding="lg" radius="md">
            <Card.Section withBorder inheritPadding py="sm">
              <Group justify="space-between">
                <Title order={5}>Cobranza</Title>
                <Button variant="primary" onClick={saveBilling}>
                  Guardar
                </Button>
              </Group>
            </Card.Section>
            <Stack gap="md" mt="md">
              <Field
                label="billing.due_days (días)"
                value={billing.due_days ?? "10"}
                onChange={(v) => setBilling((b) => ({ ...b, due_days: v }))}
              />
              <Field
                label="mikrotik.cut_profile"
                value={billing.cut_profile ?? "suspended"}
                onChange={(v) => setBilling((b) => ({ ...b, cut_profile: v }))}
              />
            </Stack>
          </Card>
        </Grid.Col>

        <Grid.Col span={12}>
          <Card withBorder padding="lg" radius="md">
            <Card.Section withBorder inheritPadding py="sm">
              <Group justify="space-between">
                <Title order={5}>Planes / precios</Title>
                <Button variant="primary" onClick={savePlans}>
                  Guardar
                </Button>
              </Group>
            </Card.Section>
            <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md" mt="md">
              {PLAN_KEYS.map((k) => (
                <Field
                  key={k}
                  label={`plan.price.${k} (ARS)`}
                  value={plans[k] ?? ""}
                  onChange={(v) => setPlans((p) => ({ ...p, [k]: v }))}
                  placeholder="ej: 15000"
                />
              ))}
            </SimpleGrid>
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
