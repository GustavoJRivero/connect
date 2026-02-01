import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Button, Card, Field } from "../ui";

export default function SettingsPage() {
  const [issuer, setIssuer] = useState<any>(null);
  const [plans, setPlans] = useState<Record<string, string>>({});
  const [billing, setBilling] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const [cuit, setCuit] = useState("");
  const [pointOfSale, setPointOfSale] = useState("");

  const planKeys = ["25M", "50M", "100M", "300M"];

  async function reload() {
    setError(null);
    try {
      const res = await api.getIssuer();
      setIssuer(res);
      setCuit(String(res.cuit ?? ""));
      setPointOfSale(String(res.point_of_sale ?? ""));

      const planRes = await api.getSettings("plan.price.");
      const nextPlans: Record<string, string> = {};
      for (const k of planKeys) nextPlans[k] = String(planRes[`plan.price.${k}`] ?? "");
      setPlans(nextPlans);

      const billRes = await api.getSettings("billing.");
      setBilling({
        due_days: String(billRes["billing.due_days"] ?? "10"),
      });

      const mtRes = await api.getSettings("mikrotik.");
      setBilling((prev) => ({
        ...prev,
        cut_profile: String(mtRes["mikrotik.cut_profile"] ?? "CORTADO"),
      }));
    } catch (e: any) {
      setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function save() {
    setError(null);
    try {
      const res = await api.putIssuer({ cuit, point_of_sale: Number(pointOfSale) });
      await reload();
    } catch (e: any) {
      setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`);
    }
  }

  async function savePlans() {
    setError(null);
    try {
      const values: Record<string, string> = {};
      for (const k of planKeys) values[`plan.price.${k}`] = plans[k] ?? "";
      const res = await api.putSettings(values);
      await reload();
    } catch (e: any) {
      setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`);
    }
  }

  async function saveBilling() {
    setError(null);
    try {
      const res = await api.putSettings({
        "billing.due_days": billing.due_days ?? "10",
        "mikrotik.cut_profile": billing.cut_profile ?? "CORTADO",
      });
      await reload();
    } catch (e: any) {
      setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`);
    }
  }

  return (
    <div className="row">
      <div className="col-lg-6">
        <Card
          className="card card-outline card-primary"
          title="Emisor (AFIP)"
          headerRight={
            <>
              <Button variant="primary" onClick={save}>
                Guardar
              </Button>
              <Button variant="default" onClick={reload}>
                Recargar
              </Button>
            </>
          }
        >
          <Field label="CUIT" value={cuit} onChange={setCuit} />
          <Field label="Punto de venta" value={pointOfSale} onChange={setPointOfSale} />
          {error ? <div className="alert alert-danger sc-error mb-0">{error}</div> : null}
        </Card>
      </div>

      <div className="col-lg-6">
        <Card
          className="card card-outline card-secondary"
          title="Cobranza"
          headerRight={
            <Button variant="primary" onClick={saveBilling}>
              Guardar
            </Button>
          }
        >
          <Field
            label="billing.due_days (días)"
            value={billing.due_days ?? "10"}
            onChange={(v) => setBilling((b) => ({ ...b, due_days: v }))}
          />
          <Field
            label="mikrotik.cut_profile"
            value={billing.cut_profile ?? "CORTADO"}
            onChange={(v) => setBilling((b) => ({ ...b, cut_profile: v }))}
          />
        </Card>
      </div>

      <div className="col-12">
        <Card
          className="card card-outline card-primary"
          title="Planes / precios"
          headerRight={
            <Button variant="primary" onClick={savePlans}>
              Guardar
            </Button>
          }
        >
          <div className="row">
            {planKeys.map((k) => (
              <div key={k} className="col-md-3">
                <Field
                  label={`plan.price.${k} (ARS)`}
                  value={plans[k] ?? ""}
                  onChange={(v) => setPlans((p) => ({ ...p, [k]: v }))}
                  placeholder="ej: 15000"
                />
              </div>
            ))}
          </div>
        </Card>
      </div>

    </div>
  );
}

