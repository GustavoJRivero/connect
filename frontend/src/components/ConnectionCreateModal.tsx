import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Button, Field } from "../ui";

export function ConnectionCreateModal(props: {
  open: boolean;
  clientId: number | null;
  servers: any[];
  planOptions: string[];
  defaultServerId?: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [serverId, setServerId] = useState<string>("");
  const [planProfile, setPlanProfile] = useState<string>("50M");
  const [serviceAddress, setServiceAddress] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [ip, setIp] = useState<string>("");
  const [pppoeUsername, setPppoeUsername] = useState<string>("");
  const [pppoePassword, setPppoePassword] = useState<string>("");

  useEffect(() => {
    if (!props.open) return;
    setError(null);
    setServiceAddress("");
    setLocation("");
    setIp("");
    setPppoeUsername("");
    setPppoePassword("");
    setPlanProfile(props.planOptions?.[0] ?? "50M");
    const def = props.defaultServerId ?? null;
    setServerId(def ? String(def) : "");
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
    if (!planProfile.trim()) {
      setError("Seleccioná un plan.");
      return;
    }
    try {
      await api.createConnection({
        client_id: Number(props.clientId),
        server_id: serverId ? Number(serverId) : null,
        plan_profile: planProfile,
        service_address: serviceAddress || null,
        location: location || null,
        ip: ip || null,
        pppoe_username: pppoeUsername.trim() || null,
        pppoe_password: pppoePassword || null,
        provision_mikrotik: true,
      });
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
              <h5 className="modal-title">Nueva conexión</h5>
              <button type="button" className="btn-close" aria-label="Close" onClick={props.onClose} />
            </div>
            <div className="modal-body">
              {error ? <div className="alert alert-danger sc-error">{error}</div> : null}

              <div className="row">
                <div className="col-md-6">
                  <div className="mb-3">
                    <label className="form-label">Servidor PPPoE (Mikrotik)</label>
                    <select className="form-select form-select-sm" value={serverId} onChange={(e) => setServerId(e.target.value)}>
                      <option value="">(Seleccionar servidor)</option>
                      {props.servers.map((s) => (
                        <option key={s.id} value={String(s.id)}>
                          #{s.id} — {s.name} ({s.host}:{s.port})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="mb-3">
                    <label className="form-label">Plan</label>
                    <select className="form-select form-select-sm" value={planProfile} onChange={(e) => setPlanProfile(e.target.value)}>
                      {(props.planOptions?.length ? props.planOptions : ["25M", "50M", "100M", "300M"]).map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <Field label="Domicilio del servicio" value={serviceAddress} onChange={setServiceAddress} />
              <Field label="Ubicación (referencia / GPS / barrio)" value={location} onChange={setLocation} />
              <Field label="IP (opcional)" value={ip} onChange={setIp} placeholder="ej: 192.168.1.50" />
              <div className="row">
                <div className="col-md-6">
                  <Field label="Usuario PPPoE (opcional)" value={pppoeUsername} onChange={setPppoeUsername} placeholder="(vacío = auto)" />
                </div>
                <div className="col-md-6">
                  <Field label="Contraseña PPPoE (opcional)" value={pppoePassword} onChange={setPppoePassword} type="password" placeholder="(vacío = auto)" />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <Button variant="default" onClick={props.onClose}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={save}>
                Crear
              </Button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" />
    </>
  );
}

