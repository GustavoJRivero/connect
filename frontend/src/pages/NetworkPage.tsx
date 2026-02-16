import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { ServerEditModal } from "../components/ServerEditModal";
import { Button, Card } from "../ui";

export default function NetworkPage() {
  const params = useParams();
  const navigate = useNavigate();
  const loc = useLocation();

  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [serverModalOpen, setServerModalOpen] = useState(false);
  const [serverModalId, setServerModalId] = useState<number | null>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testMessage, setTestMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const serverId = params.serverId ? Number(params.serverId) : null;
  const mode = useMemo<"list" | "detail">(() => (serverId ? "detail" : "list"), [serverId]);

  async function reload() {
    setError(null);
    try {
      const res = await api.listServers();
      setItems(res);
    } catch (e: any) {
      setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`);
    }
  }

  async function reloadJobs(id: number) {
    setError(null);
    try {
      const res = await api.listServerJobs(id);
      setJobs(res);
    } catch (e: any) {
      setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    if (!serverId) return;
    reloadJobs(serverId);
  }, [serverId]);

  // Auto-refresh de la cola de jobs cada 5 s para ver PENDING → RUNNING → DONE/FAILED
  useEffect(() => {
    if (!serverId) return;
    const t = setInterval(() => reloadJobs(serverId), 5000);
    return () => clearInterval(t);
  }, [serverId]);

  const selected = serverId ? items.find((x) => Number(x.id) === serverId) : null;

  const summary = useMemo(() => {
    const total = items.length;
    const totalPending = items.reduce((acc, s) => acc + (Number(s.pending_jobs) || 0), 0);
    return { total, totalPending };
  }, [items]);

  // Ordenar jobs: primero PENDING, luego RUNNING, luego el resto por id desc
  const jobsSorted = useMemo(() => {
    const order = (a: any, b: any) => {
      const s = (x: string) => (x === "PENDING" ? 0 : x === "RUNNING" ? 1 : 2);
      if (s(a.status) !== s(b.status)) return s(a.status) - s(b.status);
      return Number(b.id) - Number(a.id);
    };
    return [...jobs].sort(order);
  }, [jobs]);

  const STUCK_MS = 35000;
  const isStuck = (j: any) =>
    j.status === "RUNNING" && j.locked_at && Date.now() - new Date(j.locked_at).getTime() > STUCK_MS;
  const stuckJobs = useMemo(() => jobs.filter(isStuck), [jobs]);
  const hasStuck = stuckJobs.length > 0;

  async function testConnection( sid: number ) {
    setTestMessage(null);
    setTestingConnection(true);
    try {
      const res: any = await api.testServerConnection(sid);
      setTestMessage(res?.ok ? { ok: true, text: "Conexión exitosa." } : { ok: false, text: res?.error || "Error" });
    } catch (e: any) {
      setTestMessage({ ok: false, text: e?.body?.error || e?.body?.message || "Error de red" });
    } finally {
      setTestingConnection(false);
    }
  }

  return (
    <div>
      {error ? <div className="alert alert-danger sc-error">{error}</div> : null}

      {mode === "list" ? (
        <>
          <div className="row mb-3">
            <div className="col">
              <div className="card card-outline card-primary">
                <div className="card-body py-2 px-3 d-flex flex-wrap align-items-center gap-3">
                  <span className="fw-semibold">Resumen</span>
                  <span className="badge bg-primary">Servidores: {summary.total}</span>
                  <span className="badge bg-success">Online: —</span>
                  <span className="badge bg-secondary">Offline: —</span>
                  <span className="badge bg-warning text-dark">Jobs pendientes: {summary.totalPending}</span>
                  <div className="ms-auto d-flex gap-1">
                    <Button variant="primary" onClick={() => { setServerModalId(null); setServerModalOpen(true); }}>
                      <i className="fa-solid fa-plus me-2" />
                      Agregar servidor
                    </Button>
                    <Button variant="default" onClick={reload}>
                      <i className="fa-solid fa-rotate me-2" />
                      Recargar
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <Card className="card card-outline card-secondary" title="Servidores PPPoE">
            <div className="table-responsive">
              <table className="table table-bordered table-hover mb-0">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Nombre</th>
                    <th>Host</th>
                    <th>Usuario</th>
                    <th>Pendientes</th>
                    <th style={{ minWidth: 220 }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((s) => (
                    <tr key={s.id}>
                      <td>#{s.id}</td>
                      <td>{s.name}</td>
                      <td>{s.host}:{s.port}</td>
                      <td>{s.username}</td>
                      <td>
                        <span className={Number(s.pending_jobs) > 0 ? "text-warning fw-semibold" : "text-muted"}>
                          {Number(s.pending_jobs) ?? 0}
                        </span>
                      </td>
                      <td className="text-nowrap">
                        <Button variant="default" onClick={() => navigate(`/network/${s.id}`)}>
                          Ver
                        </Button>{" "}
                        <Button variant="secondary" onClick={() => { setServerModalId(Number(s.id)); setServerModalOpen(true); }}>
                          Editar
                        </Button>{" "}
                        <Button
                          variant="danger"
                          onClick={async () => {
                            if (!window.confirm("¿Eliminar servidor? (solo si no está en uso)")) return;
                            await api.deleteServer(Number(s.id));
                            await reload();
                          }}
                        >
                          Eliminar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!items.length ? <div className="text-muted p-3">Sin servidores. Agregá uno con el botón de arriba.</div> : null}
            </div>
          </Card>
        </>
      ) : (
        <div>
          <Card
            className="card card-outline card-primary"
            title={`Servidor PPPoE #${serverId}`}
            headerRight={
              <div className="d-flex flex-wrap gap-1 align-items-center">
                <Button variant="default" onClick={() => navigate("/network")}>
                  <i className="fa-solid fa-arrow-left me-1" />
                  Volver
                </Button>
                <Button variant="secondary" onClick={() => serverId && (setServerModalId(Number(serverId)), setServerModalOpen(true))}>
                  <i className="fa-solid fa-pen me-1" />
                  Editar
                </Button>
                <Button
                  variant="info"
                  onClick={() => serverId && testConnection(serverId)}
                  disabled={testingConnection}
                >
                  {testingConnection ? (
                    <><span className="spinner-border spinner-border-sm me-1" /> Probando...</>
                  ) : (
                    <><i className="fa-solid fa-plug me-1" /> Probar conexión</>
                  )}
                </Button>
                <Button
                  variant="default"
                  onClick={() => serverId && reloadJobs(serverId)}
                >
                  <i className="fa-solid fa-rotate me-1" />
                  Recargar jobs
                </Button>
              </div>
            }
          >
            {testMessage ? (
              <div className={`alert mb-2 ${testMessage.ok ? "alert-success" : "alert-danger"}`}>
                {testMessage.ok ? <i className="fa-solid fa-check me-2" /> : <i className="fa-solid fa-times me-2" />}
                {testMessage.text}
              </div>
            ) : null}
            <div className="text-muted">Nombre: {selected?.name ?? "-"}</div>
            <div className="text-muted">
              Host: {selected?.host ?? "-"}:{selected?.port ?? "-"}
            </div>
            <div className="text-muted">Usuario: {selected?.username ?? "-"}</div>
          </Card>

          <Card className="card card-outline card-secondary" title="Cola de jobs">
            <p className="text-muted small mb-2">
              Se actualiza cada 5 segundos. Arriba: pendientes y en ejecución; abajo: terminados o cancelados.
            </p>
            {hasStuck ? (
              <div className="alert alert-warning mb-2 d-flex align-items-center justify-content-between flex-wrap gap-2">
                <span>
                  <i className="fa-solid fa-clock me-1" />
                  {stuckJobs.length} job(s) en RUNNING hace más de 35 s (posiblemente colgados).
                </span>
                <Button
                  variant="warning"
                  onClick={async () => {
                    if (!serverId) return;
                    try {
                      const r = await api.recoverStuckJobs(serverId);
                      if (r?.count) await reloadJobs(serverId);
                    } catch (e: any) {
                      setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`);
                    }
                  }}
                >
                  <i className="fa-solid fa-rotate me-1" />
                  Recuperar colgados
                </Button>
              </div>
            ) : null}
            <div className="table-responsive">
              <table className="table table-bordered table-hover">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Estado</th>
                    <th>Cola</th>
                    <th>Intentos</th>
                    <th>Error</th>
                    <th style={{ minWidth: 100 }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {jobsSorted.map((j) => (
                    <tr key={j.id}>
                      <td>#{j.id}</td>
                      <td>{(j.created_at ?? "").slice(0, 19).replace("T", " ") || "-"}</td>
                      <td>{j.job_type}</td>
                      <td>
                        <span className={`badge ${j.status === "DONE" ? "text-bg-success" : j.status === "FAILED" ? "text-bg-danger" : j.status === "CANCELLED" ? "text-bg-secondary" : "text-bg-warning"}`}>
                          {j.status}
                        </span>
                        {isStuck(j) ? (
                          <span className="ms-1 small text-warning" title="Lleva más de 35 s en ejecución">
                            (colgado?)
                          </span>
                        ) : null}
                      </td>
                      <td className="small">
                        {j.status === "PENDING"
                          ? (j.run_after ? `A las ${(j.run_after as string).slice(11, 19)}` : "En cola")
                          : j.status === "RUNNING"
                            ? (j.locked_at ? `Desde ${(j.locked_at as string).slice(11, 19)}` : "Ejecutando…")
                            : "-"}
                      </td>
                      <td>{j.attempts ?? 0}</td>
                      <td style={{ maxWidth: 380, whiteSpace: "pre-wrap" }}>
                        {j.last_error ?? "-"}
                        {j.status === "FAILED" && j.payload_json ? (
                          <div className="mt-1 small text-muted">
                            Payload: {(() => {
                              try {
                                const p = typeof j.payload_json === "string" ? JSON.parse(j.payload_json) : j.payload_json;
                                return Object.keys(p).length ? JSON.stringify(p) : "-";
                              } catch {
                                return String(j.payload_json).slice(0, 80);
                              }
                            })()}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        {j.status === "FAILED" || (j.status === "RUNNING" && isStuck(j)) ? (
                          <Button
                            variant="primary"
                            onClick={async () => {
                              if (!serverId) return;
                              try {
                                await api.retryJob(Number(j.id));
                                await reloadJobs(serverId);
                              } catch (e: any) {
                                setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`);
                              }
                            }}
                          >
                            <i className="fa-solid fa-rotate me-1" />
                            {j.status === "RUNNING" ? "Recuperar" : "Reintentar"}
                          </Button>
                        ) : j.status === "PENDING" ? (
                          <Button
                            variant="danger"
                            onClick={async () => {
                              if (!serverId) return;
                              if (!window.confirm("¿Cancelar este job? No se ejecutará.")) return;
                              try {
                                await api.cancelJob(Number(j.id));
                                await reloadJobs(serverId);
                              } catch (e: any) {
                                setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`);
                              }
                            }}
                          >
                            <i className="fa-solid fa-times me-1" />
                            Cancelar
                          </Button>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!jobs.length ? <div className="text-muted">Sin jobs.</div> : null}
            </div>
          </Card>
        </div>
      )}

      <ServerEditModal
        open={serverModalOpen}
        serverId={serverModalId}
        onClose={() => { setServerModalOpen(false); setServerModalId(null); }}
        onSaved={() => { reload(); }}
      />
    </div>
  );
}

