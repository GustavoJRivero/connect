import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Button, Field } from "../ui";

type InvoiceType = "A" | "B" | "X";

export function InvoiceModal(props: {
  open: boolean;
  // si viene client, usamos client.id y podemos mostrar selector de conexiones
  client?: any | null;
  // conexiones opcionales para selector
  connections?: any[] | null;
  onClose: () => void;
  onSaved: (invoice: any) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string>("");
  const [connectionId, setConnectionId] = useState<string>("");
  const [invoiceType, setInvoiceType] = useState<InvoiceType>("B");
  const [total, setTotal] = useState<string>("");

  const hasConnections = Boolean((props.connections ?? []).length);
  const clientIdFixed = props.client?.id ? String(props.client.id) : "";

  const suggestedType = useMemo<InvoiceType>(() => {
    // regla simple: empresa -> A, persona -> B
    const kind = String(props.client?.kind ?? "").toUpperCase();
    return kind === "COMPANY" ? "A" : "B";
  }, [props.client?.kind]);

  useEffect(() => {
    if (!props.open) return;
    setError(null);

    setClientId(clientIdFixed);
    setInvoiceType(suggestedType);
    setTotal("");

    const firstConnId = props.connections?.[0]?.id;
    setConnectionId(firstConnId ? String(firstConnId) : "");
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

    const cid = Number(clientIdFixed || clientId);
    if (!cid || Number.isNaN(cid)) {
      setError("Ingresá un Client ID válido.");
      return;
    }
    const totalNum = Number(total);
    if (!total || Number.isNaN(totalNum)) {
      setError("Ingresá un monto válido.");
      return;
    }

    // En el flujo del cliente, la factura debe indexarse a un servicio.
    // Si tenemos conexiones disponibles, exigimos conexión seleccionada.
    if (hasConnections && !connectionId) {
      setError("Seleccioná una conexión para indexar la factura.");
      return;
    }

    try {
      const payload: any = {
        client_id: cid,
        invoice_type: invoiceType,
        total,
      };
      if (connectionId) payload.connection_id = Number(connectionId);
      const inv = await api.createInvoice(payload);
      props.onSaved(inv);
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
              <h5 className="modal-title">Nueva factura (monto libre)</h5>
              <button type="button" className="btn-close" aria-label="Close" onClick={props.onClose} />
            </div>
            <div className="modal-body">
              {error ? <div className="alert alert-danger sc-error">{error}</div> : null}

              <div className="row">
                <div className="col-md-3">
                  <Field
                    label="Client ID"
                    value={clientIdFixed || clientId}
                    onChange={setClientId}
                    placeholder="ej: 1"
                  />
                </div>

                <div className="col-md-5">
                  <div className="mb-3">
                    <label className="form-label">Conexión (servicio)</label>
                    {hasConnections ? (
                      <select className="form-select" value={connectionId} onChange={(e) => setConnectionId(e.target.value)}>
                        <option value="">Seleccionar...</option>
                        {(props.connections ?? []).map((c: any) => (
                          <option key={c.id} value={c.id}>
                            #{c.id} — {c.plan_profile} — {c.service_address ?? "-"}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="form-control"
                        value={connectionId}
                        onChange={(e) => setConnectionId(e.target.value)}
                        placeholder="Connection ID (opcional)"
                      />
                    )}
                    {hasConnections ? <div className="form-text">La factura queda indexada a una conexión.</div> : null}
                  </div>
                </div>

                <div className="col-md-2">
                  <div className="mb-3">
                    <label className="form-label">Tipo</label>
                    <select
                      className="form-select"
                      value={invoiceType}
                      onChange={(e) => setInvoiceType((e.target.value || "B").toUpperCase() as any)}
                    >
                      <option value="A">A</option>
                      <option value="B">B</option>
                      <option value="X">X (No fiscal)</option>
                    </select>
                  </div>
                </div>

                <div className="col-md-2">
                  <Field label="Total" value={total} onChange={setTotal} placeholder="ej: 15000" />
                </div>
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

