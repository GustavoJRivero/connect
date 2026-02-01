import React, { useEffect, useState } from "react";
import { BrowserRouter } from "react-router-dom";
import AppShell from "./AppShell";
import Login from "./Login";
import { api, setToken } from "./api";

export default function App() {
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
  }, []);

  if (!authed) {
    return <Login onLoggedIn={() => setAuthed(true)} />;
  }

  return (
    <>
      {error ? <pre style={{ color: "crimson" }}>{error}</pre> : null}
      <BrowserRouter>
        <AppShell onLogout={() => setAuthed(false)} />
      </BrowserRouter>
    </>
  );
}

