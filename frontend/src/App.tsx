import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppShell from "./AppShell";
import ClientPortalShell from "./ClientPortalShell";
import Login from "./Login";
import MercadoPagoReturnPage from "./pages/MercadoPagoReturnPage";
import { api, setToken } from "./api";

type UserRole = "ADMIN" | "OPERATOR" | "CLIENT" | null;

export default function App() {
  const [authed, setAuthed] = useState<boolean>(() => Boolean(localStorage.getItem("sc_token")));
  const [role, setRole] = useState<UserRole>(null);

  useEffect(() => {
    if (!authed) return;
    api
      .me()
      .then((res: any) => setRole(res?.role ?? "ADMIN"))
      .catch(() => {
        setToken(null);
        setAuthed(false);
      });
  }, [authed]);

  useEffect(() => {
    const onUnauthorized = () => {
      setToken(null);
      setAuthed(false);
      setRole(null);
    };
    window.addEventListener("sc:unauthorized", onUnauthorized as any);
    return () => window.removeEventListener("sc:unauthorized", onUnauthorized as any);
  }, []);

  const handleLogout = () => {
    setToken(null);
    setAuthed(false);
    setRole(null);
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/payment/success" element={<MercadoPagoReturnPage status="success" />} />
        <Route path="/payment/pending" element={<MercadoPagoReturnPage status="pending" />} />
        <Route path="/payment/failure" element={<MercadoPagoReturnPage status="failure" />} />
        <Route path="*" element={<AuthenticatedApp authed={authed} role={role} onLogout={handleLogout} onLoggedIn={() => setAuthed(true)} />} />
      </Routes>
    </BrowserRouter>
  );
}

function AuthenticatedApp({ authed, role, onLogout, onLoggedIn }: {
  authed: boolean;
  role: string | null;
  onLogout: () => void;
  onLoggedIn: () => void;
}) {
  if (!authed) return <Login onLoggedIn={onLoggedIn} />;
  if (!role) return null;
  return role === "CLIENT"
    ? <ClientPortalShell onLogout={onLogout} />
    : <AppShell onLogout={onLogout} />;
}
