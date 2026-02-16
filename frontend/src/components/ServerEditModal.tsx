import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Button, Field } from "../ui";

export function ServerEditModal(props: {
  open: boolean;
  serverId: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("8728");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [useSsl, setUseSsl] = useState(false);

  useEffect(() => {
    if (!props.open) return;
    setError(null);
    setTestResult(null);
    if (!props.serverId) {
      setName("");
      setHost("");
      setPort("8728");
      setUsername("");
      setPassword("");
      setUseSsl(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .getServer(Number(props.serverId))
      .then((s: any) => {
        setName(String(s?.name ?? ""));
        setHost(String(s?.host ?? ""));
        setPort(String(s?.port ?? "8728"));
        setUsername(String(s?.username ?? ""));
        setPassword("");
        setUseSsl(Boolean(s?.use_ssl ?? false));
      })
      .catch((e: any) => setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`))
      .finally(() => setLoading(false));
  }, [props.open, props.serverId]);

  useEffect(() => {
    if (!props.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.classList.add("modal-open");
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("modal-open");
      document.body.style.overflow = "";
    };
  }, [props.open, props.onClose]);

  async function testConnection() {
    setError(null);
    setTestResult(null);
    setTesting(true);
    try {
      if (props.serverId) {
        const res: any = await api.testServerConnection(Number(props.serverId), {
          host: host.trim() || undefined,
          port: port.trim() ? Number(port) : undefined,
          username: username.trim() || undefined,
          password: password.trim() || undefined,
          use_ssl: useSsl,
        });
        setTestResult(res?.ok ? { ok: true, message: "Conexión exitosa." } : { ok: false, message: res?.error || "Error desconocido" });
      } else {
        const res: any = await api.testConnectionInline({
          host: host.trim(),
          port: Number(port) || 8728,
          username: username.trim(),
          password: password.trim(),
          use_ssl: useSsl,
        });
        setTestResult(res?.ok ? { ok: true, message: "Conexión exitosa." } : { ok: false, message: res?.error || "Error desconocido" });
      }
    } catch (e: any) {
      const body = e?.body ?? e;
      setTestResult({ ok: false, message: body?.error || body?.message || String(e?.status ?? "Error de red") });
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    setError(null);
    setTestResult(null);
    if (!name.trim()) {
      setError("Nombre es requerido.");
      return;
    }
    if (!host.trim()) {
      setError("Host es requerido.");
      return;
    }
    if (!username.trim()) {
      setError("Usuario es requerido.");
      return;
    }
    const isCreate = !props.serverId;
    if (isCreate && !password.trim()) {
      setError("Contraseña es requerida al crear.");
      return;
    }
    const payload: any = {
      name: name.trim(),
      host: host.trim(),
      port: Number(port) || 8728,
      username: username.trim(),
      use_ssl: useSsl,
    };
    if (password.trim()) payload.password = password.trim();
    try {
      if (isCreate) {
        await api.createServer(payload);
      } else {
        await api.updateServer(Number(props.serverId!), payload);
      }
      props.onSaved();
      props.onClose();
    } catch (e: any) {
      const body = e?.body ?? e;
      if (e?.status === 409 && body?.error === "name_already_exists") {
        setError(`El nombre ya existe (servidor #${body?.id}).`);
        return;
      }
      setError(`${e?.status ?? ""} ${JSON.stringify(body)}`);
    }
  }

  if (!props.open) return null;

  return (
    <>
      <div
        className="modal fade show"
        style={{ display: "block" }}
        tabIndex={-1}
        role="dialog"
        onClick={(e) => e.target === e.currentTarget && props.onClose()}
      >
        <div className="modal-dialog modal-lg" role="document">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">{props.serverId ? `Editar servidor #${props.serverId}` : "Agregar servidor"}</h5>
              <button type="button" className="btn-close" onClick={props.onClose} aria-label="Cerrar" />
            </div>
            <div className="modal-body">
              {loading ? (
                <div className="text-muted">Cargando...</div>
              ) : (
                <>
                  {error ? <div className="alert alert-danger">{error}</div> : null}
                  {testResult ? (
                    <div className={`alert ${testResult.ok ? "alert-success" : "alert-danger"}`}>
                      {testResult.ok ? <i className="fa-solid fa-check me-2" /> : <i className="fa-solid fa-times me-2" />}
                      {testResult.message}
                    </div>
                  ) : null}
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
                      <Field label="Usuario" value={username} onChange={setUsername} />
                    </div>
                    <div className="col-md-6">
                      <Field
                        label="Contraseña"
                        value={password}
                        onChange={setPassword}
                        type="password"
                        placeholder="Dejar vacío para no cambiar"
                      />
                    </div>
                  </div>
                  <div className="form-check mb-3">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={useSsl}
                      onChange={(e) => setUseSsl(e.target.checked)}
                      id="serverModalUseSsl"
                    />
                    <label className="form-check-label" htmlFor="serverModalUseSsl">
                      Usar SSL
                    </label>
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <Button variant="default" onClick={props.onClose}>
                Cerrar
              </Button>
              <Button variant="info" onClick={testConnection} disabled={loading || testing || (!props.serverId && (!host.trim() || !username.trim() || !password.trim()))}>
                {testing ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" />
                    Probando...
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-plug me-2" />
                    Probar conexión
                  </>
                )}
              </Button>
              <Button variant="primary" onClick={save} disabled={loading}>
                {props.serverId ? "Guardar" : "Crear servidor"}
              </Button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" />
    </>
  );
}
