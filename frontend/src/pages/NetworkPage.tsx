import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { Button, Card, Field } from "../ui";

export default function NetworkPage() {
  const params = useParams();
  const navigate = useNavigate();
  const loc = useLocation();

  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("8728");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [useSsl, setUseSsl] = useState(false);

  const [jobs, setJobs] = useState<any[]>([]);

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

  async function createServer() {
    setError(null);
    try {
      const res = await api.createServer({
        name,
        host,
        port: Number(port),
        username,
        password,
        use_ssl: useSsl,
      });
      setName("");
      setHost("");
      setPort("8728");
      setUsername("");
      setPassword("");
      setUseSsl(false);
      await reload();
      navigate(`/network/${res.id}`);
    } catch (e: any) {
      setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`);
    }
  }

  const selected = serverId ? items.find((x) => Number(x.id) === serverId) : null;

  return (
    <div>
      {error ? <div className="alert alert-danger sc-error">{error}</div> : null}

      {mode === "list" ? (
        <div className="row">
          <div className="col-lg-6">
            <Card className="card card-outline card-primary" title="Red / Gestión de red — Servidores PPPoE">
              <Field label="Nombre" value={name} onChange={setName} placeholder="ej: MT-PPPOE-1" />
              <div className="row">
                <div className="col-md-8">
                  <Field label="IP / Host" value={host} onChange={setHost} placeholder="ej: 10.0.0.1" />
                </div>
                <div className="col-md-4">
                  <Field label="Puerto" value={port} onChange={setPort} placeholder="8728" />
                </div>
              </div>
              <div className="row">
                <div className="col-md-6">
                  <Field label="User" value={username} onChange={setUsername} />
                </div>
                <div className="col-md-6">
                  <Field label="Password" value={password} onChange={setPassword} type="password" />
                </div>
              </div>
              <div className="form-check mb-3">
                <input className="form-check-input" type="checkbox" checked={useSsl} onChange={(e) => setUseSsl(e.target.checked)} id="useSsl" />
                <label className="form-check-label" htmlFor="useSsl">
                  Usar SSL
                </label>
              </div>
              <Button variant="primary" onClick={createServer}>
                <i className="fa-solid fa-plus me-2" />
                Crear servidor
              </Button>
              <Button variant="default" onClick={reload}>
                <i className="fa-solid fa-rotate me-2" />
                Recargar
              </Button>
            </Card>
          </div>

          <div className="col-lg-6">
            <Card className="card card-outline card-secondary" title="Listado de servidores">
              <div className="table-responsive">
                <table className="table table-bordered table-hover">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Nombre</th>
                      <th>Host</th>
                      <th>Usuario</th>
                      <th style={{ width: 140 }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((s) => (
                      <tr key={s.id}>
                        <td>#{s.id}</td>
                        <td>{s.name}</td>
                        <td>
                          {s.host}:{s.port}
                        </td>
                        <td>{s.username}</td>
                        <td>
                          <Button variant="default" onClick={() => navigate(`/network/${s.id}`)}>
                            Ver
                          </Button>
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
                {!items.length ? <div className="text-muted">Sin servidores.</div> : null}
              </div>
            </Card>
          </div>
        </div>
      ) : (
        <div>
          <Card
            className="card card-outline card-primary"
            title={`Servidor PPPoE #${serverId}`}
            headerRight={
              <>
                <Button variant="default" onClick={() => navigate("/network")}>
                  <i className="fa-solid fa-arrow-left me-2" />
                  Volver
                </Button>
                <Button
                  variant="default"
                  onClick={() => {
                    if (!serverId) return;
                    reloadJobs(serverId);
                  }}
                >
                  <i className="fa-solid fa-rotate me-2" />
                  Recargar jobs
                </Button>
              </>
            }
          >
            <div className="text-muted">Nombre: {selected?.name ?? "-"}</div>
            <div className="text-muted">
              Host: {selected?.host ?? "-"}:{selected?.port ?? "-"}
            </div>
            <div className="text-muted">Usuario: {selected?.username ?? "-"}</div>
          </Card>

          <Card className="card card-outline card-secondary" title="Jobs">
            <div className="table-responsive">
              <table className="table table-bordered table-hover">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Estado</th>
                    <th>Intentos</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id}>
                      <td>#{j.id}</td>
                      <td>{(j.created_at ?? "").slice(0, 19).replace("T", " ") || "-"}</td>
                      <td>{j.job_type}</td>
                      <td>
                        <span className={`badge ${j.status === "DONE" ? "text-bg-success" : j.status === "FAILED" ? "text-bg-danger" : "text-bg-warning"}`}>
                          {j.status}
                        </span>
                      </td>
                      <td>{j.attempts ?? 0}</td>
                      <td style={{ maxWidth: 380, whiteSpace: "pre-wrap" }}>{j.last_error ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!jobs.length ? <div className="text-muted">Sin jobs.</div> : null}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

