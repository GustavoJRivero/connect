import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Button, Field } from "../ui";

type ComplaintKind = "BILLING" | "TECH";

export function ComplaintModal(props: {
  open: boolean;
  client: any | null;
  connections: any[];
  onClose: () => void;
  onSaved: (complaint: any) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [connectionId, setConnectionId] = useState<string>("");
  const [kind, setKind] = useState<ComplaintKind>("TECH");
  const [detail, setDetail] = useState<string>("");

  const defaultConnId = props.connections?.[0]?.id ? String(props.connections[0].id) : "";

  const clientId = useMemo(() => Number(props.client?.id ?? 0), [props.client?.id]);

  useEffect(() => {
    if (!props.open) return;
    setError(null);
    setKind("TECH");
    setDetail("");
    setConnectionId(defaultConnId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, props.client?.id]);

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

  async function save() {
    setError(null);
    if (!clientId || Number.isNaN(clientId)) {
      setError("Cliente inválido.");
      return;
    }
    if (!connectionId) {
      setError("Seleccioná una conexión.");
      return;
    }
    if (!detail.trim()) {
      setError("Ingresá el detalle.");
      return;
    }
    try {
      const created = await api.createComplaint({
        client_id: clientId,
        connection_id: Number(connectionId),
        kind,
        detail,
        status: "TODO",
      });
      props.onSaved(created);
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
              <h5 className="modal-title">Nuevo reclamo</h5>
              <button type="button" className="btn-close" aria-label="Close" onClick={props.onClose} />
            </div>
            <div className="modal-body">
              {error ? <div className="alert alert-danger sc-error">{error}</div> : null}

              <div className="row">
                <div className="col-md-6">
                  <div className="mb-3">
                    <label className="form-label">Conexión (servicio)</label>
                    <select className="form-select" value={connectionId} onChange={(e) => setConnectionId(e.target.value)}>
                      <option value="">Seleccionar...</option>
                      {(props.connections ?? []).map((c: any) => (
                        <option key={c.id} value={c.id}>
                          #{c.id} — {c.plan_profile} — {c.service_address ?? "-"}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="col-md-6">
                  <div className="mb-3">
                    <label className="form-label">Tipo</label>
                    <select className="form-select" value={kind} onChange={(e) => setKind((e.target.value || "TECH") as any)}>
                      <option value="BILLING">Facturación</option>
                      <option value="TECH">Técnico</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="mb-3">
                <label className="form-label">Detalle</label>
                <textarea
                  className="form-control"
                  rows={4}
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  placeholder="Describí el problema..."
                />
              </div>
            </div>
            <div className="modal-footer">
              <Button variant="default" onClick={props.onClose}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={save}>
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

