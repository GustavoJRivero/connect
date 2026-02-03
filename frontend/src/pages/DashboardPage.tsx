import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .getDashboardSummary()
      .then((d: any) => {
        if (!alive) return;
        setData(d);
        setError(null);
      })
      .catch((e: any) => {
        if (!alive) return;
        setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`);
      });
    return () => {
      alive = false;
    };
  }, []);

  const fmtMoney = useMemo(() => {
    const nf = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
    return (raw: any) => {
      const n = Number(raw ?? 0);
      return nf.format(Number.isFinite(n) ? n : 0);
    };
  }, []);

  const stats = {
    clientes: data?.clients?.total ?? "—",
    activos: data?.connections?.active ?? "—",
    cortados: data?.connections?.cut ?? "—",
    vencidas: data?.invoices?.overdue ?? "—",
    cobranzaHoy: fmtMoney(data?.payments?.today_total ?? 0),
    pagosHoy: data?.payments?.today_count ?? "—",
    pendientes: data?.jobs?.pending ?? "—",
  };

  const fmtDateTime = useMemo(() => {
    return (iso: any) => {
      if (!iso) return "—";
      const d = new Date(String(iso));
      if (Number.isNaN(d.getTime())) return String(iso);
      return d.toLocaleString("es-AR");
    };
  }, []);

  return (
    <div>
      {error ? <div className="alert alert-danger sc-error">{error}</div> : null}
      <div className="row">
        <div className="col-lg-3 col-6">
          <div className="small-box bg-info">
            <div className="inner">
              <h3>{stats.clientes}</h3>
              <p>Clientes</p>
            </div>
            <div className="icon">
              <i className="fa-solid fa-users" />
            </div>
            <Link to="/clients" className="small-box-footer">
              Más info <i className="fa-solid fa-circle-arrow-right" />
            </Link>
          </div>
        </div>

        <div className="col-lg-3 col-6">
          <div className="small-box bg-success">
            <div className="inner">
              <h3>{stats.activos}</h3>
              <p>Conexiones activas</p>
            </div>
            <div className="icon">
              <i className="fa-solid fa-wifi" />
            </div>
            <Link to="/clients" className="small-box-footer">
              Ver conexiones <i className="fa-solid fa-circle-arrow-right" />
            </Link>
          </div>
        </div>

        <div className="col-lg-3 col-6">
          <div className="small-box bg-warning">
            <div className="inner">
              <h3>{stats.vencidas}</h3>
              <p>Facturas vencidas</p>
            </div>
            <div className="icon">
              <i className="fa-solid fa-file-invoice-dollar" />
            </div>
            <Link to="/invoices" className="small-box-footer">
              Ver listado <i className="fa-solid fa-circle-arrow-right" />
            </Link>
          </div>
        </div>

        <div className="col-lg-3 col-6">
          <div className="small-box bg-danger">
            <div className="inner">
              <h3>{stats.cortados}</h3>
              <p>Cortados</p>
            </div>
            <div className="icon">
              <i className="fa-solid fa-ban" />
            </div>
            <Link to="/clients" className="small-box-footer">
              Ver cortes <i className="fa-solid fa-circle-arrow-right" />
            </Link>
          </div>
        </div>
      </div>

      <div className="row">
        <div className="col-lg-8">
          <div className="card card-outline card-primary">
            <div className="card-header">
              <h3 className="card-title">Resumen</h3>
            </div>
            <div className="card-body">
              <div className="row">
                <div className="col-md-4">
                  <div className="info-box">
                    <span className="info-box-icon bg-primary elevation-1">
                      <i className="fa-solid fa-cash-register" />
                    </span>
                    <div className="info-box-content">
                      <span className="info-box-text">Cobranza hoy</span>
                      <span className="info-box-number">{stats.cobranzaHoy}</span>
                    </div>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="info-box">
                    <span className="info-box-icon bg-success elevation-1">
                      <i className="fa-solid fa-check" />
                    </span>
                    <div className="info-box-content">
                      <span className="info-box-text">Pagos imputados</span>
                      <span className="info-box-number">{stats.pagosHoy}</span>
                    </div>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="info-box">
                    <span className="info-box-icon bg-warning elevation-1">
                      <i className="fa-solid fa-clock" />
                    </span>
                    <div className="info-box-content">
                      <span className="info-box-text">Pendientes</span>
                      <span className="info-box-number">{stats.pendientes}</span>
                    </div>
                  </div>
                </div>
              </div>

              {data?.today ? (
                <div className="text-muted small">
                  Actualizado: <strong>{data.today}</strong>
                </div>
              ) : null}
            </div>
          </div>

          <div className="card card-outline card-info mt-3">
            <div className="card-header">
              <h3 className="card-title mb-0">Últimas transacciones (pagos)</h3>
            </div>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-sm table-striped align-middle mb-0">
                  <colgroup>
                    <col style={{ width: "44%" }} />
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "22%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th className="text-end text-nowrap">Monto</th>
                      <th className="text-nowrap">Usuario</th>
                      <th className="text-nowrap">Fecha/Hora</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.recent_payments || []).length ? (
                      (data?.recent_payments || []).map((p: any) => (
                        <tr key={p.id}>
                          <td>
                            <Link to={`/clients/${p.client_id}`} className="d-inline-block text-truncate" style={{ maxWidth: 420 }}>
                              {p.client_name || `#${p.client_id}`}
                            </Link>
                          </td>
                          <td className="text-end text-nowrap pe-3">{fmtMoney(p.amount)}</td>
                          <td className="text-nowrap">{p?.created_by?.username || "—"}</td>
                          <td className="text-nowrap">{fmtDateTime(p.created_at)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="text-muted small p-3">
                          Sin pagos registrados todavía.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="card-footer p-0">
              <Link to="/payments" className="small-box-footer sc-card-footer-center">
                Ver todos los pagos <i className="fa-solid fa-circle-arrow-right" />
              </Link>
            </div>
          </div>
        </div>

        <div className="col-lg-4">
          <div className="card card-outline card-secondary">
            <div className="card-header">
              <h3 className="card-title">Accesos rápidos</h3>
            </div>
            <div className="card-body">
              <ul className="list-group">
                <li className="list-group-item d-flex justify-content-between align-items-center">
                  Generar facturas
                  <span className="badge bg-primary">Cobranza</span>
                </li>
                <li className="list-group-item d-flex justify-content-between align-items-center">
                  Ejecutar corte/reconexión
                  <span className="badge bg-danger">Enforce</span>
                </li>
                <li className="list-group-item d-flex justify-content-between align-items-center">
                  Configurar planes
                  <span className="badge bg-secondary">Settings</span>
                </li>
              </ul>
              <div className="mt-3 d-flex gap-2 flex-wrap">
                <Link to="/billing" className="btn btn-sm btn-primary">
                  Ir a cobranza
                </Link>
                <Link to="/invoices" className="btn btn-sm btn-outline-primary">
                  Ver facturas
                </Link>
                <Link to="/settings" className="btn btn-sm btn-outline-secondary">
                  Configuración
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

