import React, { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import AppShell from "./AppShell";
import Login from "./Login";
import { api, setToken } from "./api";
import { PortalApp } from "./portal/PortalApp";
import { PortalHome } from "./portal/pages/Home";
import { PortalInvoices } from "./portal/pages/Invoices";
import { PortalConnection } from "./portal/pages/Connection";
import { PortalComplaints } from "./portal/pages/Complaints";
import { PortalNotices } from "./portal/pages/Notices";

function AdminRoot() {
  const [authed, setAuthed] = useState<boolean>(() => Boolean(localStorage.getItem("sc_token")));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authed) return;
    api
      .me()
      .then(() => setError(null))
      .catch(() => {
        setToken(null);
        setAuthed(false);
      });
  }, [authed]);

  useEffect(() => {
    const onUnauthorized = () => {
      setToken(null);
      setAuthed(false);
    };
    window.addEventListener("sc:unauthorized", onUnauthorized as any);
    return () => window.removeEventListener("sc:unauthorized", onUnauthorized as any);
  }, []);

  if (!authed) {
    return <Login onLoggedIn={() => setAuthed(true)} />;
  }

  return (
    <>
      {error ? (
        <div style={{ padding: 16 }}>
          <div style={{ color: "var(--mantine-color-red-6)", whiteSpace: "pre-wrap" }}>{error}</div>
        </div>
      ) : null}
      <AppShell onLogout={() => setAuthed(false)} />
    </>
  );
}

const ADMIN_BASE = "/4dmin";

function isAdminPath(pathname: string): boolean {
  return pathname === ADMIN_BASE || pathname.startsWith(`${ADMIN_BASE}/`);
}

// Links viejos (y checkouts de Mercado Pago ya creados) apuntan a /portal/...
function LegacyPortalRedirect() {
  const loc = useLocation();
  const rest = loc.pathname.replace(/^\/portal/, "") || "/";
  return <Navigate to={`${rest}${loc.search}${loc.hash}`} replace />;
}

export default function App() {
  if (isAdminPath(window.location.pathname)) {
    return (
      <BrowserRouter basename={ADMIN_BASE}>
        <AdminRoot />
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/portal/*" element={<LegacyPortalRedirect />} />
        <Route path="/" element={<PortalApp />}>
          <Route index element={<PortalHome />} />
          <Route path="invoices" element={<PortalInvoices />} />
          <Route path="connection" element={<PortalConnection />} />
          <Route path="complaints" element={<PortalComplaints />} />
          <Route path="notices" element={<PortalNotices />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
