import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Button, Card, Field } from "../ui";

type PlanItem = {
  id?: number;
  name: string;
  profile: string;
  download_mbps: number;
  upload_mbps: number;
  price: string;
  iva_percent: string;
  price_with_iva?: string;
  is_active: boolean;
  connections_count?: number;
};

const emptyPlan: PlanItem = {
  name: "",
  profile: "",
  download_mbps: 0,
  upload_mbps: 0,
  price: "",
  iva_percent: "21",
  is_active: true,
};

export default function SettingsPage() {
  const [billing, setBilling] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [cuit, setCuit] = useState("");
  const [pointOfSale, setPointOfSale] = useState("");

  // Plans
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [editingPlan, setEditingPlan] = useState<PlanItem | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  async function reload() {
    setError(null);
    try {
      const res = await api.getIssuer();
      setCuit(String(res.cuit ?? ""));
      setPointOfSale(String(res.point_of_sale ?? ""));

      const billRes = await api.getSettings("billing.");
      const mtRes = await api.getSettings("mikrotik.");
      setBilling({
        due_days: String(billRes["billing.due_days"] ?? "10"),
        mode: String(billRes["billing.mode"] ?? "GLOBAL"),
        global_day: String(billRes["billing.global_day"] ?? "1"),
        cut_profile: String(mtRes["mikrotik.cut_profile"] ?? "CORTADO"),
      });

      const plansRes = await api.listPlans();
      setPlans(plansRes ?? []);
    } catch (e: any) {
      setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function saveIssuer() {
    setError(null);
    try {
      await api.putIssuer({ cuit, point_of_sale: Number(pointOfSale) });
      setSuccess("Emisor guardado.");
      await reload();
    } catch (e: any) {
      setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`);
    }
  }

  async function saveBilling() {
    setError(null);
    try {
      await api.putSettings({
        "billing.due_days": billing.due_days ?? "10",
        "billing.mode": billing.mode ?? "GLOBAL",
        "billing.global_day": billing.global_day ?? "1",
        "mikrotik.cut_profile": billing.cut_profile ?? "CORTADO",
      });
      setSuccess("Configuración de facturación guardada.");
      await reload();
    } catch (e: any) {
      setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`);
    }
  }

  async function savePlan() {
    setPlanError(null);
    if (!editingPlan) return;
    try {
      const payload = {
        name: editingPlan.name,
        profile: editingPlan.profile,
        download_mbps: editingPlan.download_mbps,
        upload_mbps: editingPlan.upload_mbps,
        price: Number(editingPlan.price || 0),
        iva_percent: Number(editingPlan.iva_percent || 21),
        is_active: editingPlan.is_active,
      };
      if (editingPlan.id) {
        await api.updatePlan(editingPlan.id, payload);
      } else {
        await api.createPlan(payload);
      }
      setEditingPlan(null);
      setSuccess(editingPlan.id ? "Plan actualizado." : "Plan creado.");
      await reload();
    } catch (e: any) {
      const body = e?.body ?? e;
      if (body?.error === "profile_already_exists") {
        setPlanError(`El profile "${editingPlan.profile}" ya existe.`);
      } else {
        setPlanError(`${e?.status ?? ""} ${JSON.stringify(body)}`);
      }
    }
  }

  async function deletePlan(p: PlanItem) {
    if (!p.id) return;
    if (!window.confirm(`¿Eliminar plan "${p.name}"?`)) return;
    try {
      await api.deletePlan(p.id);
      setSuccess("Plan eliminado.");
      await reload();
    } catch (e: any) {
      const body = e?.body ?? e;
      setError(body?.message || JSON.stringify(body));
    }
  }

  const billingMode = (billing.mode ?? "GLOBAL").toUpperCase();

  return (
    <div className="row">
      {success ? (
        <div className="col-12">
          <div className="alert alert-success d-flex align-items-center justify-content-between">
            <div>{success}</div>
            <button type="button" className="btn-close" onClick={() => setSuccess(null)} />
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="col-12">
          <div className="alert alert-danger sc-error">{error}</div>
        </div>
      ) : null}

      {/* Emisor */}
      <div className="col-lg-6">
        <Card
          className="card card-outline card-primary"
          title="Emisor (AFIP)"
          headerRight={
            <>
              <Button variant="primary" onClick={saveIssuer}>Guardar</Button>
              <Button variant="default" onClick={reload}>Recargar</Button>
            </>
          }
        >
          <Field label="CUIT" value={cuit} onChange={setCuit} />
          <Field label="Punto de venta" value={pointOfSale} onChange={setPointOfSale} />
        </Card>
      </div>

      {/* Facturación */}
      <div className="col-lg-6">
        <Card
          className="card card-outline card-info"
          title="Facturación automática"
          headerRight={
            <Button variant="primary" onClick={saveBilling}>Guardar</Button>
          }
        >
          <div className="mb-3">
            <label className="form-label fw-bold">Modo de facturación</label>
            <div className="btn-group d-flex" role="group">
              <button
                type="button"
                className={`btn ${billingMode === "GLOBAL" ? "btn-primary" : "btn-outline-primary"}`}
                onClick={() => setBilling((b) => ({ ...b, mode: "GLOBAL" }))}
              >
                Global (mismo día para todos)
              </button>
              <button
                type="button"
                className={`btn ${billingMode === "INDIVIDUAL" ? "btn-primary" : "btn-outline-primary"}`}
                onClick={() => setBilling((b) => ({ ...b, mode: "INDIVIDUAL" }))}
              >
                Individual (por conexión)
              </button>
            </div>
          </div>

          {billingMode === "GLOBAL" ? (
            <div className="mb-3">
              <label className="form-label">Día de facturación (todos los clientes)</label>
              <select
                className="form-select"
                value={billing.global_day ?? "1"}
                onChange={(e) => setBilling((b) => ({ ...b, global_day: e.target.value }))}
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={String(d)}>{d}</option>
                ))}
              </select>
              <div className="form-text">
                Todas las conexiones se facturan este día del mes.
              </div>
            </div>
          ) : (
            <div className="alert alert-info mb-3" style={{ fontSize: "0.9em" }}>
              Cada conexión tiene su propio día de facturación configurado en su ficha.
            </div>
          )}

          <Field
            label="Días de vencimiento"
            value={billing.due_days ?? "10"}
            onChange={(v) => setBilling((b) => ({ ...b, due_days: v }))}
          />
          <div className="form-text mb-3">
            Días desde la emisión hasta el vencimiento de la factura.
          </div>

          <Field
            label="Perfil de corte Mikrotik"
            value={billing.cut_profile ?? "CORTADO"}
            onChange={(v) => setBilling((b) => ({ ...b, cut_profile: v }))}
          />
        </Card>
      </div>

      {/* Planes */}
      <div className="col-12">
        <Card
          className="card card-outline card-primary"
          title="Planes de servicio"
          headerRight={
            <Button variant="primary" onClick={() => setEditingPlan({ ...emptyPlan })}>
              <i className="fa-solid fa-plus me-2" />
              Nuevo plan
            </Button>
          }
        >
          {/* Formulario de edición/creación inline */}
          {editingPlan ? (
            <div className="border rounded p-3 mb-3 bg-light">
              <h6 className="mb-3">{editingPlan.id ? `Editar plan #${editingPlan.id}` : "Nuevo plan"}</h6>
              {planError ? <div className="alert alert-danger py-1">{planError}</div> : null}
              <div className="row g-2">
                <div className="col-md-3">
                  <label className="form-label">Nombre</label>
                  <input
                    className="form-control form-control-sm"
                    value={editingPlan.name}
                    onChange={(e) => setEditingPlan({ ...editingPlan, name: e.target.value })}
                    placeholder="ej: 50 Megas"
                  />
                </div>
                <div className="col-md-2">
                  <label className="form-label">Profile Mikrotik</label>
                  <input
                    className="form-control form-control-sm"
                    value={editingPlan.profile}
                    onChange={(e) => setEditingPlan({ ...editingPlan, profile: e.target.value })}
                    placeholder="ej: 50M"
                  />
                </div>
                <div className="col-md-1">
                  <label className="form-label">Bajada</label>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    value={editingPlan.download_mbps}
                    onChange={(e) => setEditingPlan({ ...editingPlan, download_mbps: Number(e.target.value) })}
                  />
                </div>
                <div className="col-md-1">
                  <label className="form-label">Subida</label>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    value={editingPlan.upload_mbps}
                    onChange={(e) => setEditingPlan({ ...editingPlan, upload_mbps: Number(e.target.value) })}
                  />
                </div>
                <div className="col-md-2">
                  <label className="form-label">Precio (sin IVA)</label>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    value={editingPlan.price}
                    onChange={(e) => setEditingPlan({ ...editingPlan, price: e.target.value })}
                    placeholder="ej: 15000"
                  />
                </div>
                <div className="col-md-1">
                  <label className="form-label">IVA %</label>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    value={editingPlan.iva_percent}
                    onChange={(e) => setEditingPlan({ ...editingPlan, iva_percent: e.target.value })}
                  />
                </div>
                <div className="col-md-2 d-flex align-items-end gap-2">
                  <Button variant="primary" onClick={savePlan}>
                    {editingPlan.id ? "Guardar" : "Crear"}
                  </Button>
                  <Button variant="default" onClick={() => { setEditingPlan(null); setPlanError(null); }}>
                    Cancelar
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {/* Tabla de planes */}
          <div className="table-responsive">
            <table className="table table-bordered table-hover table-sm mb-0">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Profile</th>
                  <th>Bajada</th>
                  <th>Subida</th>
                  <th>Precio</th>
                  <th>IVA</th>
                  <th>Total c/IVA</th>
                  <th>Conexiones</th>
                  <th>Estado</th>
                  <th style={{ width: 120 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong></td>
                    <td><code>{p.profile}</code></td>
                    <td>{p.download_mbps} Mbps</td>
                    <td>{p.upload_mbps} Mbps</td>
                    <td>$ {p.price}</td>
                    <td>{p.iva_percent}%</td>
                    <td><strong>$ {p.price_with_iva}</strong></td>
                    <td>{p.connections_count ?? 0}</td>
                    <td>
                      <span className={`badge ${p.is_active ? "text-bg-success" : "text-bg-secondary"}`}>
                        {p.is_active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary me-1"
                        title="Editar"
                        onClick={() => {
                          setEditingPlan({ ...p });
                          setPlanError(null);
                        }}
                      >
                        <i className="fa-solid fa-pen-to-square" />
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        title="Eliminar"
                        onClick={() => deletePlan(p)}
                      >
                        <i className="fa-solid fa-trash" />
                      </button>
                    </td>
                  </tr>
                ))}
                {!plans.length ? (
                  <tr>
                    <td colSpan={10} className="text-muted text-center py-3">
                      No hay planes cargados. Creá el primer plan para poder facturar.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
