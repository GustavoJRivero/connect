import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Button, Field } from "../ui";

export function ConnectionDetailsModal(props: {
  open: boolean;
  connection: any | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const conn = props.connection;
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<any | null>(null);
  const [ip, setIp] = useState<string>("");

  useEffect(() => {
    if (!props.open) return;
    setError(null);
    setStatus(null);
    setIp(String(conn?.ip ?? ""));
    if (!conn?.id) return;
    api
      .getConnectionMtStatus(Number(conn.id))
      .then(setStatus)
      .catch((e: any) => setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, conn?.id]);

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

  async function saveIp() {
    setError(null);
    if (!conn?.id) return;
    try {
      await api.updateConnection(Number(conn.id), { ip: ip || null, sync_mikrotik: true });
      props.onSaved();
    } catch (e: any) {
      setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`);
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
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) props.onClose();
        }}
      >
        <div className="modal-dialog modal-lg" role="document">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">Conexión #{conn?.id} — Detalles</h5>
              <button type="button" className="btn-close" aria-label="Close" onClick={props.onClose} />
            </div>
            <div className="modal-body">
              {error ? <div className="alert alert-danger sc-error">{error}</div> : null}

              <div className="row">
                <div className="col-md-6">
                  <div className="text-muted">PPPoE: {conn?.pppoe_name ?? "-"}</div>
                  <div className="text-muted">Plan: {conn?.plan_profile ?? "-"}</div>
                  <div className="text-muted">Estado: {conn?.status === "CUT" ? "Suspend" : "Active"}</div>
                  <div className="text-muted">Server: {conn?.server_name ?? conn?.server_id ?? "-"}</div>
                </div>
                <div className="col-md-6">
                  <div className="text-muted">IP: {conn?.ip ?? "-"}</div>
                  <div className="text-muted">Uptime (último): {conn?.last_uptime ?? "-"}</div>
                  <div className="text-muted">Última conexión: {conn?.last_connected_at ? String(conn.last_connected_at).replace("T", " ").slice(0, 19) : "-"}</div>
                  <div className="text-muted">Última desconexión: {conn?.last_disconnected_at ? String(conn.last_disconnected_at).replace("T", " ").slice(0, 19) : "-"}</div>
                </div>
              </div>

              <hr />

              <div className="row">
                <div className="col-md-6">
                  <Field label="IP (opcional)" value={ip} onChange={setIp} placeholder="ej: 192.168.1.50" />
                  <div className="form-text">Si se setea, se aplica al PPP secret como IP fija (remote-address).</div>
                </div>
                <div className="col-md-6">
                  <div className="text-muted">Estado Mikrotik (en vivo)</div>
                  <div className="text-muted">Activo: {status ? (status.active ? "Sí" : "No") : "..."}</div>
                  <div className="text-muted">IP asignada: {status?.assigned_ip ?? "-"}</div>
                  <div className="text-muted">Tiempo de conexión: {status?.uptime ?? "-"}</div>
                  <div className="text-muted">Actualizado: {status?.fetched_at ? String(status.fetched_at).replace("T", " ").slice(0, 19) : "-"}</div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <Button variant="default" onClick={props.onClose}>
                Cerrar
              </Button>
              <Button variant="primary" onClick={saveIp}>
                Guardar
              </Button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" />
    </>
  );
}

