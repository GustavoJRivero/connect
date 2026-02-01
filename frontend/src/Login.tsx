import React, { useEffect, useState } from "react";
import { api, setToken } from "./api";
import { Button, Card, Field } from "./ui";

export default function Login(props: { onLoggedIn: () => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "bootstrap">("login");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.body.classList.remove("sidebar-mini", "layout-fixed");
    document.body.classList.add("hold-transition", "login-page");
    return () => {
      document.body.classList.remove("login-page");
    };
  }, []);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      if (mode === "bootstrap") {
        await api.bootstrap(username, password);
      }
      const res = await api.login(username, password);
      setToken(res.access_token);
      props.onLoggedIn();
    } catch (e: any) {
      setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-box">
      <div className="login-logo">
        <b>Sistema</b>Connect
      </div>

      <Card title={mode === "login" ? "Login" : "Bootstrap admin"}>
        <p className="login-box-msg">
          Iniciá sesión con JWT. Si es la primera vez, usá “Bootstrap admin” para crear el primer usuario.
        </p>
        <Field label="Usuario" value={username} onChange={setUsername} />
        <Field label="Password" type="password" value={password} onChange={setPassword} />

        <div style={{ marginTop: 8 }}>
          <Button variant="primary" disabled={busy} onClick={submit}>
            {busy ? "Procesando..." : mode === "login" ? "Entrar" : "Crear admin + Entrar"}
          </Button>
          <Button variant="default" disabled={busy} onClick={() => setMode(mode === "login" ? "bootstrap" : "login")}>
            Cambiar a {mode === "login" ? "Bootstrap" : "Login"}
          </Button>
        </div>

        {error ? (
          <div className="alert alert-danger sc-error" style={{ marginTop: 12 }}>
            {error}
          </div>
        ) : null}
      </Card>
    </div>
  );
}

