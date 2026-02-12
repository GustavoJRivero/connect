import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Button, Card } from "../ui";

const LEVEL_COLORS: Record<string, string> = {
  DEBUG: "text-bg-secondary",
  INFO: "text-bg-info",
  WARNING: "text-bg-warning text-dark",
  ERROR: "text-bg-danger",
};

const MODULE_COLORS: Record<string, string> = {
  BILLING: "text-bg-primary",
  CLIENT: "text-bg-success",
  CONNECTION: "text-bg-info",
  PAYMENT: "text-bg-warning text-dark",
  INVOICE: "text-bg-secondary",
  NETWORK: "text-bg-dark",
  AUTH: "text-bg-danger",
  SYSTEM: "text-bg-light text-dark",
};

function LevelBadge({ level }: { level: string }) {
  return <span className={`badge ${LEVEL_COLORS[level] ?? "text-bg-secondary"}`}>{level}</span>;
}

function ModuleBadge({ module }: { module: string }) {
  return <span className={`badge ${MODULE_COLORS[module] ?? "text-bg-secondary"}`}>{module}</span>;
}

export default function LogsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [filterModule, setFilterModule] = useState<string>("");
  const [filterLevel, setFilterLevel] = useState<string>("");
  const [filterQ, setFilterQ] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // Config
  const [config, setConfig] = useState<any>(null);
  const [showConfig, setShowConfig] = useState(false);

  // Detalle expandido
  const [expanded, setExpanded] = useState<number | null>(null);

  // Módulos conocidos
  const [modules, setModules] = useState<any[]>([]);

  async function loadLogs() {
    setError(null);
    try {
      const offset = Math.max(0, (page - 1) * pageSize);
      const res = await api.getLogs({
        module: filterModule || undefined,
        level: filterLevel || undefined,
        q: filterQ || undefined,
        from: dateFrom || undefined,
        to: dateTo || undefined,
        limit: pageSize,
        offset,
      });
      setItems(res?.items ?? []);
      setTotal(res?.total ?? 0);
    } catch (e: any) {
      setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`);
    }
  }

  async function loadConfig() {
    try {
      const res = await api.getLoggingConfig();
      setConfig(res);
    } catch {
      // ignore
    }
  }

  async function loadModules() {
    try {
      const res = await api.getLogModules();
      setModules(res ?? []);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadModules();
    loadConfig();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => loadLogs(), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filterModule, filterLevel, filterQ, dateFrom, dateTo]);

  async function toggleMaster() {
    if (!config) return;
    const next = !config.enabled;
    await api.updateLoggingConfig({ enabled: next });
    await loadConfig();
  }

  async function toggleModule(moduleId: string, current: boolean) {
    await api.updateLoggingConfig({ modules: { [moduleId]: !current } });
    await loadConfig();
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(total, (page - 1) * pageSize + items.length);

  return (
    <div className="row">
      {/* Filtros */}
      <div className="col-12">
        <Card
          className="card card-outline card-primary"
          title="Logs del sistema"
          headerRight={
            <div className="d-flex gap-2 align-items-center">
              {config ? (
                <span
                  className={`badge ${config.enabled ? "text-bg-success" : "text-bg-danger"}`}
                  style={{ cursor: "pointer" }}
                  onClick={toggleMaster}
                  title="Click para activar/desactivar logging"
                >
                  {config.enabled ? "Logging activo" : "Logging desactivado"}
                </span>
              ) : null}
              <button
                type="button"
                className={`btn btn-sm ${showConfig ? "btn-primary" : "btn-outline-primary"}`}
                onClick={() => setShowConfig(!showConfig)}
                title="Configuración de logging"
              >
                <i className="fa-solid fa-sliders" />
              </button>
              <Button variant="default" onClick={loadLogs}>
                <i className="fa-solid fa-rotate" />
              </Button>
            </div>
          }
        >
          {/* Panel de configuración colapsable */}
          {showConfig && config ? (
            <div className="alert alert-light border mb-3">
              <div className="d-flex align-items-center justify-content-between mb-2">
                <strong>Configuración de logging por módulo</strong>
                <div className="form-check form-switch">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    checked={config.enabled}
                    onChange={toggleMaster}
                    id="masterSwitch"
                  />
                  <label className="form-check-label" htmlFor="masterSwitch">
                    Master
                  </label>
                </div>
              </div>
              <div className="row g-2">
                {(config.modules ?? []).map((m: any) => (
                  <div key={m.module} className="col-auto">
                    <div className="form-check form-switch">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        checked={m.enabled}
                        onChange={() => toggleModule(m.module, m.enabled)}
                        id={`log-${m.module}`}
                        disabled={!config.enabled}
                      />
                      <label className="form-check-label" htmlFor={`log-${m.module}`}>
                        <ModuleBadge module={m.module} /> {m.label}
                      </label>
                    </div>
                  </div>
                ))}
              </div>
              <div className="form-text mt-2">
                Los módulos desactivados no registrarán nuevos logs en la base de datos (siguen en consola).
              </div>
            </div>
          ) : null}

          {/* Filtros */}
          <div className="row g-2 align-items-end mb-3">
            <div className="col-md-2">
              <label className="form-label">Módulo</label>
              <select
                className="form-select form-select-sm"
                value={filterModule}
                onChange={(e) => {
                  setFilterModule(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todos</option>
                {modules.map((m: any) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label">Nivel</label>
              <select
                className="form-select form-select-sm"
                value={filterLevel}
                onChange={(e) => {
                  setFilterLevel(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todos</option>
                <option value="DEBUG">DEBUG</option>
                <option value="INFO">INFO</option>
                <option value="WARNING">WARNING</option>
                <option value="ERROR">ERROR</option>
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">Buscar</label>
              <input
                className="form-control form-control-sm"
                value={filterQ}
                onChange={(e) => {
                  setFilterQ(e.target.value);
                  setPage(1);
                }}
                placeholder="texto en mensaje..."
              />
            </div>
            <div className="col-md-2">
              <label className="form-label">Desde</label>
              <input
                type="date"
                className="form-control form-control-sm"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="col-md-2">
              <label className="form-label">Hasta</label>
              <input
                type="date"
                className="form-control form-control-sm"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          {error ? <div className="alert alert-danger sc-error">{error}</div> : null}

          {/* Tabla de logs */}
          <div className="table-responsive">
            <table className="table table-sm table-hover table-bordered mb-0" style={{ fontSize: "0.88em" }}>
              <thead>
                <tr>
                  <th style={{ width: 155 }}>Fecha/hora</th>
                  <th style={{ width: 65 }}>Nivel</th>
                  <th style={{ width: 100 }}>Módulo</th>
                  <th style={{ width: 160 }}>Acción</th>
                  <th>Mensaje</th>
                  <th style={{ width: 50 }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((log: any) => (
                  <React.Fragment key={log.id}>
                    <tr
                      className={log.level === "ERROR" ? "table-danger" : log.level === "WARNING" ? "table-warning" : ""}
                      style={{ cursor: log.details ? "pointer" : "default" }}
                      onClick={() => {
                        if (log.details) setExpanded(expanded === log.id ? null : log.id);
                      }}
                    >
                      <td className="text-nowrap">
                        <small className="text-muted">
                          {log.created_at ? formatDateTime(log.created_at) : "-"}
                        </small>
                      </td>
                      <td>
                        <LevelBadge level={log.level} />
                      </td>
                      <td>
                        <ModuleBadge module={log.module} />
                      </td>
                      <td>
                        <code style={{ fontSize: "0.85em" }}>{log.action}</code>
                      </td>
                      <td>{log.message}</td>
                      <td className="text-center">
                        {log.details ? (
                          <i
                            className={`fa-solid ${expanded === log.id ? "fa-chevron-up" : "fa-chevron-down"} text-muted`}
                          />
                        ) : null}
                      </td>
                    </tr>
                    {expanded === log.id && log.details ? (
                      <tr>
                        <td colSpan={6} className="bg-light">
                          <div className="p-2">
                            <table className="table table-sm table-borderless mb-0" style={{ fontSize: "0.85em" }}>
                              <tbody>
                                {Object.entries(log.details).map(([k, v]) => (
                                  <tr key={k}>
                                    <td style={{ width: 180 }}>
                                      <strong>{k}</strong>
                                    </td>
                                    <td>
                                      <code>{String(v)}</code>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {log.ref_type ? (
                              <div className="text-muted mt-1" style={{ fontSize: "0.8em" }}>
                                Ref: {log.ref_type} #{log.ref_id}
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {!items.length && !error ? <div className="text-muted p-3">Sin logs registrados.</div> : null}

          {/* Paginación */}
          <div className="d-flex align-items-center justify-content-between mt-3">
            <div className="text-muted" style={{ fontSize: "0.9em" }}>
              Mostrando <b>{start}</b>-<b>{end}</b> de <b>{total}</b>
            </div>
            <ul className="pagination pagination-sm m-0">
              <li className={`page-item ${page <= 1 ? "disabled" : ""}`}>
                <button className="page-link" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                  Anterior
                </button>
              </li>
              <li className="page-item disabled">
                <span className="page-link">
                  {page} / {totalPages}
                </span>
              </li>
              <li className={`page-item ${page >= totalPages ? "disabled" : ""}`}>
                <button
                  className="page-link"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Siguiente
                </button>
              </li>
            </ul>
          </div>
        </Card>
      </div>
    </div>
  );
}

function formatDateTime(iso: string): string {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return iso;
  }
}
