import React, { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { api, setToken } from "./api";
import { Button } from "./ui";

import ClientsPage from "./pages/ClientsPage";
import DashboardPage from "./pages/DashboardPage";
import BillingPage from "./pages/BillingPage";
import InvoicesPage from "./pages/InvoicesPage";
import PaymentsPage from "./pages/PaymentsPage";
import SettingsPage from "./pages/SettingsPage";
import NetworkPage from "./pages/NetworkPage";

export default function AppShell(props: { onLogout: () => void }) {
  const [me, setMe] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const loc = useLocation();

  useEffect(() => {
    document.body.classList.remove("login-page");
    // AdminLTE v4 layout classes (docs)
    document.body.classList.add("hold-transition", "layout-fixed", "sidebar-expand-lg", "sidebar-mini", "bg-body-tertiary");
    // Restore sidebar collapsed state (AdminLTE uses `sidebar-collapse` on body)
    const collapsed = localStorage.getItem("sc.sidebarCollapsed") === "1";
    if (collapsed) document.body.classList.add("sidebar-collapse");
    return () => {
      document.body.classList.remove("layout-fixed", "sidebar-expand-lg", "sidebar-mini", "bg-body-tertiary", "sidebar-collapse");
    };
  }, []);

  useEffect(() => {
    api
      .me()
      .then(setMe)
      .catch((e: any) => setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`));
  }, []);

  useEffect(() => {
    const onLoading = (e: any) => {
      const p = Number(e?.detail?.pending ?? 0);
      setPending(Number.isFinite(p) ? p : 0);
    };
    window.addEventListener("sc:loading", onLoading as any);
    return () => window.removeEventListener("sc:loading", onLoading as any);
  }, []);

  const tabs: { to: string; id: string; label: string; icon: string }[] = useMemo(
    () => [
      { to: "/dashboard", id: "dashboard", label: "Dashboard", icon: "fa-gauge-high" },
      { to: "/clients", id: "clients", label: "Clientes", icon: "fa-users" },
      { to: "/billing", id: "billing", label: "Cobranza", icon: "fa-hand-holding-dollar" },
      { to: "/invoices", id: "invoices", label: "Facturas", icon: "fa-file-invoice" },
      { to: "/payments", id: "payments", label: "Pagos", icon: "fa-receipt" },
      { to: "/network", id: "network", label: "Red", icon: "fa-network-wired" },
      { to: "/settings", id: "settings", label: "Configuración", icon: "fa-gear" },
    ],
    []
  );

  const currentTitle =
    tabs.find((t) => (loc.pathname === "/" ? "/dashboard" : loc.pathname).startsWith(t.to))?.label ?? "Panel";

  return (
    <div className="app-wrapper">
      {/* Header */}
      <nav className="app-header navbar navbar-expand bg-body">
        <div className="container-fluid">
          {pending > 0 ? (
            <div className="sc-progress-top">
              <div className="sc-progress-top-bar" />
            </div>
          ) : null}

          <ul className="navbar-nav">
            <li className="nav-item">
              <a
                className="nav-link"
                href="#"
                role="button"
                data-lte-toggle="sidebar"
                onClick={(e) => {
                  // Toggle manual (React SPA)
                  e.preventDefault();
                  const next = !document.body.classList.contains("sidebar-collapse");
                  if (next) document.body.classList.add("sidebar-collapse");
                  else document.body.classList.remove("sidebar-collapse");
                  localStorage.setItem("sc.sidebarCollapsed", next ? "1" : "0");
                }}
              >
                <i className="fas fa-bars" />
              </a>
            </li>
            <li className="nav-item d-none d-md-block">
              <Link to="/dashboard" className="nav-link">
                Home
              </Link>
            </li>
          </ul>

          <ul className="navbar-nav ms-auto">
            <li className="nav-item">
              <span className="nav-link" style={{ cursor: "default" }}>
                {me ? (
                  <>
                    <i className="fa-regular fa-user me-2" />
                    {me.username}
                  </>
                ) : (
                  "..."
                )}
              </span>
            </li>
            <li className="nav-item">
              <Button
                variant="danger"
                onClick={() => {
                  setToken(null);
                  props.onLogout();
                }}
              >
                <i className="fa-solid fa-right-from-bracket me-2" />
                Salir
              </Button>
            </li>
          </ul>
        </div>
      </nav>

      {/* Sidebar */}
      <aside className="app-sidebar bg-body-secondary shadow" data-bs-theme="dark">
        <div className="sidebar-brand">
          <Link to="/dashboard" className="brand-link">
            <span className="brand-text fw-light">SistemaConnect</span>
          </Link>
        </div>

        <div className="sidebar-wrapper">
          <nav className="mt-2">
            <ul className="nav sidebar-menu flex-column" data-lte-toggle="treeview" role="menu" data-accordion="false">
              {tabs.map((t) => (
                <li className="nav-item" key={t.id}>
                  <NavLink to={t.to} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                    <i className={`nav-icon fa-solid ${t.icon}`} />
                    <p>{t.label}</p>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </aside>

      {/* Main */}
      <main className="app-main">
        <div className="app-content-header">
          <div className="container-fluid">
            <div className="row">
              <div className="col-sm-6">
                <h3 className="mb-0">{currentTitle}</h3>
              </div>
              <div className="col-sm-6">
                <ol className="breadcrumb float-sm-end">
                  <li className="breadcrumb-item">
                    <Link to="/dashboard">Home</Link>
                  </li>
                  <li className="breadcrumb-item active">{currentTitle}</li>
                </ol>
              </div>
            </div>
          </div>
        </div>

        <div className="app-content">
          <div className="container-fluid">
            {error ? <div className="alert alert-danger sc-error">{error}</div> : null}
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/clients" element={<ClientsPage />} />
              <Route path="/clients/new" element={<ClientsPage />} />
              <Route path="/clients/:clientId" element={<ClientsPage />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route path="/invoices" element={<InvoicesPage />} />
              <Route path="/payments" element={<PaymentsPage />} />
              <Route path="/network" element={<NetworkPage />} />
              <Route path="/network/:serverId" element={<NetworkPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </div>
        </div>
      </main>

      <footer className="app-footer">
        <div className="float-end d-none d-sm-inline">ISP Admin</div>
        <strong>SistemaConnect</strong>
      </footer>
    </div>
  );
}

