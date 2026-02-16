import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Button, Card, Field } from "../ui";
import { Grid, Alert } from "@mantine/core";

const PLAN_KEYS = ["25M", "50M", "100M", "300M"];

export default function SettingsPage() {
  const [issuer, setIssuer] = useState<unknown>(null);
  const [plans, setPlans] = useState<Record<string, string>>({});
  const [billing, setBilling] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [cuit, setCuit] = useState("");
  const [pointOfSale, setPointOfSale] = useState("");

  async function reload() {
    setError(null);
    try {
      const res = await api.getIssuer() as { cuit?: string; point_of_sale?: number };
      setIssuer(res);
      setCuit(String(res?.cuit ?? ""));
      setPointOfSale(String(res?.point_of_sale ?? ""));

      const planRes = await api.getSettings("plan.price.") as Record<string, string>;
      const nextPlans: Record<string, string> = {};
      for (const k of PLAN_KEYS) nextPlans[k] = String(planRes[`plan.price.${k}`] ?? "");
      setPlans(nextPlans);

      const billRes = await api.getSettings("billing.") as Record<string, string>;
      setBilling({ due_days: String(billRes["billing.due_days"] ?? "10") });

      const mtRes = await api.getSettings("mikrotik.") as Record<string, string>;
      setBilling((prev) => ({ ...prev, cut_profile: String(mtRes["mikrotik.cut_profile"] ?? "suspended") }));
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
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
    <Grid>
      <Grid.Col span={{ base: 12, lg: 6 }}>
        <Card title="Emisor (AFIP)" headerRight={<><Button variant="primary" onClick={save}>Guardar</Button><Button variant="default" onClick={reload}>Recargar</Button></>}>
          <Field label="CUIT" value={cuit} onChange={setCuit} />
          <Field label="Punto de venta" value={pointOfSale} onChange={setPointOfSale} />
          {error ? <Alert color="red" className="sc-error" mt="sm">{error}</Alert> : null}
        </Card>
      </Grid.Col>

      <Grid.Col span={{ base: 12, lg: 6 }}>
        <Card title="Cobranza" headerRight={<Button variant="primary" onClick={saveBilling}>Guardar</Button>}>
          <Field label="billing.due_days (días)" value={billing.due_days ?? "10"} onChange={(v) => setBilling((b) => ({ ...b, due_days: v }))} />
          <Field label="mikrotik.cut_profile" value={billing.cut_profile ?? "suspended"} onChange={(v) => setBilling((b) => ({ ...b, cut_profile: v }))} />
        </Card>
      </Grid.Col>

      <Grid.Col span={12}>
        <Card title="Planes / precios" headerRight={<Button variant="primary" onClick={savePlans}>Guardar</Button>}>
          <Grid>
            {PLAN_KEYS.map((k) => (
              <Grid.Col key={k} span={{ base: 12, md: 3 }}>
                <Field
                  label={`plan.price.${k} (ARS)`}
                  value={plans[k] ?? ""}
                  onChange={(v) => setPlans((p) => ({ ...p, [k]: v }))}
                  placeholder="ej: 15000"
                />
              </Grid.Col>
            ))}
          </Grid>
        </Card>
      </Grid.Col>
    </Grid>
  );
}
