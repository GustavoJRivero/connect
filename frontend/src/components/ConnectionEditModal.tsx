import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Button, Field } from "../ui";

export function ConnectionEditModal(props: {
  open: boolean;
  connection: any | null;
  servers: any[];
  planOptions: any[];
  billingMode?: "GLOBAL" | "INDIVIDUAL";
  onClose: () => void;
  onSaved: () => void;
}) {
  const conn = props.connection;

  const [error, setError] = useState<string | null>(null);

  const [serverId, setServerId] = useState<string>("");
  const [planProfile, setPlanProfile] = useState<string>("50M");
  const [serviceAddress, setServiceAddress] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [ip, setIp] = useState<string>("");
  const [pppoeUsername, setPppoeUsername] = useState<string>("");
  const [pppoePassword, setPppoePassword] = useState<string>("");
  const [billingDay, setBillingDay] = useState<number>(1);
  const [prorateFirstMonth, setProrateFirstMonth] = useState<boolean>(true);

  useEffect(() => {
    if (!props.open) return;
    setError(null);
    setServerId(conn?.server_id != null ? String(conn.server_id) : "");
    setPlanProfile(String(conn?.plan_profile ?? "50M"));
    setServiceAddress(String(conn?.service_address ?? ""));
    setLocation(String(conn?.location ?? ""));
    setIp(String(conn?.ip ?? ""));
    setPppoeUsername(String(conn?.pppoe_username ?? conn?.pppoe_name ?? ""));
    setPppoePassword(String(conn?.pppoe_password ?? ""));
    setBillingDay(Number(conn?.billing_day ?? 1));
    setProrateFirstMonth(conn?.prorate_first_month !== false);
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

  async function save() {
    setError(null);
    if (!conn?.id) return;
    if (!planProfile.trim()) {
      setError("Seleccioná un plan.");
      return;
    }
    try {
      await api.updateConnection(Number(conn.id), {
        server_id: serverId ? Number(serverId) : null,
        plan_profile: planProfile,
        service_address: serviceAddress || null,
        location: location || null,
        ip: ip || null,
        pppoe_username: pppoeUsername.trim() || null,
        pppoe_password: pppoePassword || null,
        billing_day: billingDay,
        prorate_first_month: prorateFirstMonth,
        sync_mikrotik: true,
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
              <h5 className="modal-title">Editar conexión #{conn?.id}</h5>
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
                    <div className="form-text">No se edita el estado desde acá.</div>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="mb-3">
                    <label className="form-label">Plan</label>
                    <select className="form-select form-select-sm" value={planProfile} onChange={(e) => setPlanProfile(e.target.value)}>
                      {(props.planOptions ?? []).map((p: any) => (
                        <option key={p.id ?? p.profile ?? p} value={p.profile ?? p}>
                          {p.name ? `${p.name} (${p.profile}) — $${p.price_with_iva}` : p}
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
                  <Field label="Usuario PPPoE" value={pppoeUsername} onChange={setPppoeUsername} />
                </div>
                <div className="col-md-6">
                  <Field label="Contraseña PPPoE" value={pppoePassword} onChange={setPppoePassword} type="password" />
                </div>
              </div>

              <hr className="my-3" />
              <h6 className="text-muted mb-2">Facturación</h6>
              {(props.billingMode ?? "GLOBAL") === "INDIVIDUAL" ? (
                <div className="row">
                  <div className="col-md-6">
                    <div className="mb-3">
                      <label className="form-label">Día de facturación</label>
                      <select
                        className="form-select form-select-sm"
                        value={String(billingDay)}
                        onChange={(e) => setBillingDay(Number(e.target.value))}
                      >
                        {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                          <option key={d} value={String(d)}>{d}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="mb-3 mt-md-4">
                      <div className="form-check">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          checked={prorateFirstMonth}
                          onChange={(e) => setProrateFirstMonth(e.target.checked)}
                          id="cemProrate"
                        />
                        <label className="form-check-label" htmlFor="cemProrate">Prorratear primer mes</label>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="alert alert-info mb-0" style={{ fontSize: "0.9em" }}>
                  Día de facturación configurado de forma <b>global</b> en Configuración.
                  <div className="form-check mt-2">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={prorateFirstMonth}
                      onChange={(e) => setProrateFirstMonth(e.target.checked)}
                      id="cemProrate"
                    />
                    <label className="form-check-label" htmlFor="cemProrate">Prorratear primer mes</label>
                  </div>
                </div>
              )}
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

