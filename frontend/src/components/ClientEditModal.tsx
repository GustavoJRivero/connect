import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Button, Field } from "../ui";

export function ClientEditModal(props: {
  open: boolean;
  clientId: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<any | null>(null);

  const [kind, setKind] = useState<"PERSON" | "COMPANY">("PERSON");
  const [fullName, setFullName] = useState("");
  const [dni, setDni] = useState("");
  const [cuit, setCuit] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!props.open) return;
    setError(null);
    setClient(null);
    if (!props.clientId) return;
    setLoading(true);
    api
      .getClient(Number(props.clientId))
      .then((c: any) => {
        setClient(c);
        setKind((c?.kind ?? "PERSON").toUpperCase() === "COMPANY" ? "COMPANY" : "PERSON");
        setFullName(String(c?.full_name ?? ""));
        setDni(String(c?.dni ?? ""));
        setCuit(String(c?.cuit ?? ""));
        setPhone(String(c?.phone ?? ""));
        setEmail(String(c?.email ?? ""));
        setAddress(String(c?.address ?? ""));
        setIsActive(Boolean(c?.is_active ?? true));
      })
      .catch((e: any) => setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, props.clientId]);

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
    if (!props.clientId) return;
    if (!fullName.trim()) {
      setError("Nombre / Razón social es requerido.");
      return;
    }
    try {
      await api.updateClient(Number(props.clientId), {
        kind,
        full_name: fullName.trim(),
        dni: kind === "PERSON" ? (dni.trim() || null) : null,
        cuit: kind === "COMPANY" ? (cuit.trim() || null) : null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        is_active: Boolean(isActive),
      });
      props.onSaved();
    } catch (e: any) {
      const body = e?.body ?? e;
      if (e?.status === 409 && body?.error === "dni_already_exists") {
        setError(`DNI ya existe (cliente #${body?.client_id}).`);
        return;
      }
      if (e?.status === 409 && body?.error === "cuit_already_exists") {
        setError(`CUIT ya existe (cliente #${body?.client_id}).`);
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
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) props.onClose();
        }}
      >
        <div className="modal-dialog modal-lg" role="document">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">Editar cliente {props.clientId ? `#${props.clientId}` : ""}</h5>
              <button type="button" className="btn-close" aria-label="Close" onClick={props.onClose} />
            </div>
            <div className="modal-body">
              {error ? <div className="alert alert-danger sc-error">{error}</div> : null}
              {loading ? <div className="text-muted">Cargando...</div> : null}

              {!loading && client ? (
                <div className="row">
                  <div className="col-lg-6">
                    <div className="mb-3">
                      <label className="form-label">Tipo</label>
                      <select
                        className="form-select form-select-sm"
                        value={kind}
                        onChange={(e) => {
                          const k = e.target.value as any;
                          setKind(k);
                          if (k === "PERSON") setCuit("");
                          else setDni("");
                        }}
                      >
                        <option value="PERSON">Persona</option>
                        <option value="COMPANY">Empresa</option>
                      </select>
                    </div>
                    <Field label="Nombre / Razón social" value={fullName} onChange={setFullName} />
                    {kind === "PERSON" ? <Field label="DNI" value={dni} onChange={setDni} /> : <Field label="CUIT" value={cuit} onChange={setCuit} />}
                    <div className="row">
                      <div className="col-md-6">
                        <Field label="Tel/Cel" value={phone} onChange={setPhone} />
                      </div>
                      <div className="col-md-6">
                        <Field label="Email" value={email} onChange={setEmail} />
                      </div>
                    </div>
                  </div>
                  <div className="col-lg-6">
                    <Field label="Dirección" value={address} onChange={setAddress} />
                    <div className="form-check mb-3">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        checked={isActive}
                        onChange={(e) => setIsActive(e.target.checked)}
                        id="clientActive"
                      />
                      <label className="form-check-label" htmlFor="clientActive">
                        Activo
                      </label>
                    </div>
                    <div className="text-muted small">Solo se editan datos del titular. Las conexiones se gestionan en la solapa “Conexiones”.</div>
                  </div>
                </div>
              ) : null}
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
