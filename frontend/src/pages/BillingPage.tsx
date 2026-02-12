import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Button, Card, Field } from "../ui";

function RunStatusBadge({ status }: { status: string }) {
  if (status === "COMPLETED") return <span className="badge text-bg-success">Completado</span>;
  if (status === "RUNNING") return <span className="badge text-bg-warning">Ejecutando</span>;
  if (status === "FAILED") return <span className="badge text-bg-danger">Fallido</span>;
  return <span className="badge text-bg-secondary">{status}</span>;
}

function TriggerBadge({ trigger }: { trigger: string }) {
  if (trigger === "SCHEDULER") return <span className="badge text-bg-info">Automático</span>;
  if (trigger === "MANUAL") return <span className="badge text-bg-primary">Manual</span>;
  if (trigger === "CATCHUP") return <span className="badge text-bg-warning text-dark">Catch-up</span>;
  return <span className="badge text-bg-secondary">{trigger}</span>;
}

export default function BillingPage() {
  const [issueDate, setIssueDate] = useState("");
  const [forceAll, setForceAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const [status, setStatus] = useState<any>(null);

  async function loadStatus() {
    try {
      const res = await api.getBillingStatus();
      setStatus(res);
    } catch {
      // silently ignore
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function generate() {
    setError(null);
    setResult(null);
    try {
      const payload: any = { issue: true, force_all: forceAll };
      if (issueDate) payload.issue_date = issueDate;
      const res = await api.generateBilling(payload);
      const parts = [];
      if (res?.created) parts.push(`${res.created} factura(s) creada(s)`);
      if (res?.skipped) parts.push(`${res.skipped} omitida(s) (ya facturadas)`);
      if (res?.errors?.length) parts.push(`${res.errors.length} error(es)`);
      if (res?.duration_ms) parts.push(`${res.duration_ms}ms`);
      setResult(parts.length ? parts.join(", ") + "." : "Sin conexiones para facturar.");
      await loadStatus();
    } catch (e: any) {
      setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`);
    }
  }

  async function enforce() {
    setError(null);
    setResult(null);
    try {
      const res = await api.enforceBilling({});
      const parts = [];
      if (res?.cut?.length) parts.push(`${res.cut.length} cortada(s)`);
      if (res?.restored?.length) parts.push(`${res.restored.length} restaurada(s)`);
      setResult(parts.length ? parts.join(", ") + "." : "Sin cambios.");
    } catch (e: any) {
      setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`);
    }
  }

  const recentRuns = status?.recent_runs ?? [];
  const schedule = status?.schedule ?? [];
  const totalActive = status?.total_active_connections ?? 0;
  const billingConfig = status?.config ?? {};
  const billingModeLabel = billingConfig.mode === "INDIVIDUAL"
    ? "Individual (cada conexión tiene su propio día)"
    : `Global (todas el día ${billingConfig.global_day ?? "?"})`;

  return (
    <div className="row">
      {/* Banner de modo activo */}
      <div className="col-12 mb-3">
        <div className={`alert ${billingConfig.mode === "INDIVIDUAL" ? "alert-info" : "alert-primary"} d-flex align-items-center mb-0`}>
          <i className="fa-solid fa-calendar-days me-2" />
          <div>
            <strong>Modo de facturación:</strong> {billingModeLabel}
            <span className="ms-3 text-muted" style={{ fontSize: "0.85em" }}>
              (cambiar en Configuración)
            </span>
          </div>
        </div>
      </div>

      <div className="col-lg-6">
        <Card className="card card-outline card-primary" title="Generación de facturas">
          <p className="text-muted mb-3">
            Genera facturas para conexiones activas cuyo <b>día de facturación</b> coincide con
            la fecha de emisión. La facturación automática se ejecuta diariamente a las 06:00 UTC.
          </p>
          <Field
            label="Fecha de emisión (opcional YYYY-MM-DD)"
            value={issueDate}
            onChange={setIssueDate}
            placeholder="2026-01-31"
          />
          <div className="form-check mb-3">
            <input
              className="form-check-input"
              type="checkbox"
              checked={forceAll}
              onChange={(e) => setForceAll(e.target.checked)}
              id="forceAll"
            />
            <label className="form-check-label" htmlFor="forceAll">
              Forzar todas las conexiones (ignorar billing_day)
            </label>
          </div>
          <Button variant="primary" onClick={generate}>
            <i className="fa-solid fa-rotate me-2" />
            Generar
          </Button>
        </Card>
      </div>

      <div className="col-lg-6">
        <Card className="card card-outline card-danger" title="Corte / reconexión automático">
          <p className="text-muted mb-3">Evalúa facturas vencidas impagas y aplica CUT/RESTORE en Mikrotik.</p>
          <Button variant="danger" onClick={enforce}>
            <i className="fa-solid fa-bolt me-2" />
            Ejecutar enforce
          </Button>
        </Card>
      </div>

      {result ? (
        <div className="col-12">
          <div className="alert alert-success">{result}</div>
        </div>
      ) : null}

      {error ? (
        <div className="col-12">
          <div className="alert alert-danger sc-error">{error}</div>
        </div>
      ) : null}

      {/* Calendario de facturación */}
      <div className="col-lg-6">
        <Card
          className="card card-outline card-secondary"
          title="Calendario de facturación"
          headerRight={
            <span className="badge text-bg-info">{totalActive} conexiones activas</span>
          }
        >
          {billingConfig.mode === "GLOBAL" ? (
            <div>
              <div className="d-flex align-items-center gap-3 mb-2">
                <span className="fs-4 fw-bold text-primary">Día {billingConfig.global_day ?? "?"}</span>
                <span className="text-muted">para todas las conexiones</span>
              </div>
              <div className="text-muted">
                {totalActive} conexiones activas se facturarán el día {billingConfig.global_day ?? "?"} de cada mes.
              </div>
            </div>
          ) : schedule.length ? (
            <div className="table-responsive">
              <table className="table table-sm table-bordered mb-0">
                <thead>
                  <tr>
                    <th>Día del mes</th>
                    <th>Conexiones</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.map((s: any) => (
                    <tr key={s.billing_day}>
                      <td><strong>{s.billing_day}</strong></td>
                      <td>{s.active_connections}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-muted">Sin conexiones activas.</div>
          )}
        </Card>
      </div>

      {/* Últimas ejecuciones */}
      <div className="col-lg-6">
        <Card
          className="card card-outline card-secondary"
          title="Últimas ejecuciones"
          headerRight={
            <Button variant="default" onClick={loadStatus}>
              <i className="fa-solid fa-rotate" />
            </Button>
          }
        >
          {recentRuns.length ? (
            <div className="table-responsive">
              <table className="table table-sm table-bordered mb-0">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Estado</th>
                    <th>Creadas</th>
                    <th>Errores</th>
                    <th>Duración</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRuns.map((r: any) => (
                    <tr key={r.id}>
                      <td>{r.billing_date}</td>
                      <td><TriggerBadge trigger={r.trigger} /></td>
                      <td><RunStatusBadge status={r.status} /></td>
                      <td>{r.invoices_created}</td>
                      <td>
                        {r.errors_count > 0 ? (
                          <span className="text-danger">{r.errors_count}</span>
                        ) : (
                          <span className="text-success">0</span>
                        )}
                      </td>
                      <td>{r.duration_ms != null ? `${r.duration_ms}ms` : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-muted">Sin ejecuciones registradas.</div>
          )}
        </Card>
      </div>
    </div>
  );
}
