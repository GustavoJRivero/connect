import React from "react";

export default function DashboardPage() {
  // Dummy values (luego los sacamos del backend)
  const stats = {
    clientes: 128,
    activos: 112,
    cortados: 9,
    vencidas: 17,
    cobranzaHoy: "AR$ 245.000",
  };

  return (
    <div>
      <div className="row">
        <div className="col-lg-3 col-6">
          <div className="small-box bg-info">
            <div className="inner">
              <h3>{stats.clientes}</h3>
              <p>Clientes</p>
            </div>
            <div className="icon">
              <i className="fas fa-users" />
            </div>
            <a href="#" className="small-box-footer" onClick={(e) => e.preventDefault()}>
              Más info <i className="fas fa-arrow-circle-right" />
            </a>
          </div>
        </div>

        <div className="col-lg-3 col-6">
          <div className="small-box bg-success">
            <div className="inner">
              <h3>{stats.activos}</h3>
              <p>Conexiones activas</p>
            </div>
            <div className="icon">
              <i className="fas fa-wifi" />
            </div>
            <a href="#" className="small-box-footer" onClick={(e) => e.preventDefault()}>
              Más info <i className="fas fa-arrow-circle-right" />
            </a>
          </div>
        </div>

        <div className="col-lg-3 col-6">
          <div className="small-box bg-warning">
            <div className="inner">
              <h3>{stats.vencidas}</h3>
              <p>Facturas vencidas</p>
            </div>
            <div className="icon">
              <i className="fas fa-file-invoice-dollar" />
            </div>
            <a href="#" className="small-box-footer" onClick={(e) => e.preventDefault()}>
              Ver listado <i className="fas fa-arrow-circle-right" />
            </a>
          </div>
        </div>

        <div className="col-lg-3 col-6">
          <div className="small-box bg-danger">
            <div className="inner">
              <h3>{stats.cortados}</h3>
              <p>Cortados</p>
            </div>
            <div className="icon">
              <i className="fas fa-ban" />
            </div>
            <a href="#" className="small-box-footer" onClick={(e) => e.preventDefault()}>
              Ver cortes <i className="fas fa-arrow-circle-right" />
            </a>
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
                      <i className="fas fa-cash-register" />
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
                      <i className="fas fa-check" />
                    </span>
                    <div className="info-box-content">
                      <span className="info-box-text">Pagos imputados</span>
                      <span className="info-box-number">42</span>
                    </div>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="info-box">
                    <span className="info-box-icon bg-warning elevation-1">
                      <i className="fas fa-clock" />
                    </span>
                    <div className="info-box-content">
                      <span className="info-box-text">Pendientes</span>
                      <span className="info-box-number">18</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="alert alert-info mb-0">
                Dashboard con valores dummy. Próximo paso: traer KPIs reales (clientes, conexiones, vencidas, cortados)
                desde la API.
              </div>
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

