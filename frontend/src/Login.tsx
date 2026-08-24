import React, { useState } from "react";
import {
  Text,
  TextInput,
  PasswordInput,
  Stack,
  Alert,
  Paper,
  Anchor,
  Loader,
  UnstyledButton,
} from "@mantine/core";
import { api, setToken } from "./api";
import { formatApiError } from "./format";
import { BrandLogo } from "./BrandLogo";

export default function Login(props: { onLoggedIn: () => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "bootstrap">("login");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      if (mode === "bootstrap") {
        await api.bootstrap(username, password);
      }
      const res = await api.login(username, password);
      setToken(res.access_token);
      props.onLoggedIn();
    } catch (e: unknown) {
      setError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sc-login">
      <Paper className="sc-login-card" shadow="md" p="xl" radius="lg" withBorder style={{ maxWidth: 420, width: "100%", overflow: "visible" }}>
        <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <Stack gap="lg">
            <Stack gap={10} align="center" mb={4}>
              <BrandLogo mark={64} stack wordmarkSize={26} />
              <Text className="sc-login-kicker">Panel</Text>
              <Text className="sc-login-lead">
                {mode === "login"
                  ? "Ingresá con tu usuario y contraseña."
                  : "Creá el primer usuario administrador del sistema."}
              </Text>
            </Stack>
            <Stack gap="sm">
              <TextInput
                aria-label="Usuario"
                placeholder="Usuario"
                value={username}
                onChange={(e) => setUsername(e.currentTarget.value)}
                autoFocus
                size="md"
                radius="md"
                variant="filled"
                className="sc-login-field"
              />
              <PasswordInput
                aria-label="Contraseña"
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                size="md"
                radius="md"
                variant="filled"
                className="sc-login-field"
              />
            </Stack>
            <UnstyledButton type="submit" className="sc-login-go" disabled={busy}>
              {busy ? <Loader size="sm" color="white" /> : mode === "login" ? "Entrar" : "Crear admin y entrar"}
            </UnstyledButton>
            <UnstyledButton
              type="button"
              className="sc-login-alt"
              disabled={busy}
              onClick={() => setMode(mode === "login" ? "bootstrap" : "login")}
            >
              {mode === "login" ? "Crear primer admin" : "Volver a iniciar sesión"}
            </UnstyledButton>
            {error ? (
              <Alert color="red" title="Error">
                {error}
              </Alert>
            ) : null}
            <Text size="sm" c="dimmed" ta="center">
              ¿Sos cliente?{" "}
              <Anchor href="/portal" size="sm">
                Entrar al portal
              </Anchor>
            </Text>
          </Stack>
        </form>
      </Paper>
    </div>
  );
}
