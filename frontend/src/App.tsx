import React, { useEffect, useState } from "react";
import { BrowserRouter } from "react-router-dom";
import AppShell from "./AppShell";
import ClientPortalShell from "./ClientPortalShell";
import Login from "./Login";
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

  if (!authed) {
    return <Login onLoggedIn={() => setAuthed(true)} />;
  }

  // Mientras carga el rol mostramos nada (evita flash)
  if (!role) return null;

  return (
    <BrowserRouter>
      {role === "CLIENT" ? (
        <ClientPortalShell onLogout={handleLogout} />
      ) : (
        <AppShell onLogout={handleLogout} />
      )}
    </BrowserRouter>
  );
}

