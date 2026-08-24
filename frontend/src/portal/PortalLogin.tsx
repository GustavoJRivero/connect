import React, { useState } from "react";
import { Alert, Loader, Paper, PasswordInput, Stack, Text, TextInput, Anchor, UnstyledButton } from "@mantine/core";
import { Link } from "react-router-dom";
import { formatApiError } from "../format";
import { BrandLogo } from "../BrandLogo";
import { portalApi, setPortalToken } from "./api";
import "./portal.css";

export function PortalLogin(props: { onLoggedIn: () => void }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await portalApi.login(identifier.trim(), password);
      setPortalToken(res.access_token);
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
              <Text className="sc-login-kicker">Tu portal</Text>
              <Text className="sc-login-lead">
                Pagá, mirá tu internet y pedí ayuda en un solo lugar.
              </Text>
            </Stack>
            <Stack gap="sm">
              <TextInput
                aria-label="DNI, CUIT o email"
                placeholder="DNI, CUIT o email"
                value={identifier}
                onChange={(e) => setIdentifier(e.currentTarget.value)}
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
              {busy ? <Loader size="sm" color="white" /> : "Entrar"}
            </UnstyledButton>
            {error ? <Alert color="red" title="No se pudo entrar">{error}</Alert> : null}
            <Text size="sm" c="dimmed" ta="center">
              ¿Sos del equipo? <Anchor component={Link} to="/" size="sm">Ir al panel</Anchor>
            </Text>
          </Stack>
        </form>
      </Paper>
    </div>
  );
}
