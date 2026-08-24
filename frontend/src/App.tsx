import React, { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/portal" element={<PortalApp />}>
          <Route index element={<PortalHome />} />
          <Route path="invoices" element={<PortalInvoices />} />
          <Route path="connection" element={<PortalConnection />} />
          <Route path="complaints" element={<PortalComplaints />} />
          <Route path="notices" element={<PortalNotices />} />
        </Route>
        <Route path="*" element={<AdminRoot />} />
      </Routes>
    </BrowserRouter>
  );
}
