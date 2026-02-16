import React, { useState } from "react";
import {
  Card,
  Text,
  TextInput,
  PasswordInput,
  Button,
  Group,
  Stack,
  Alert,
  Title,
  Box,
  Paper,
} from "@mantine/core";
import { api, setToken } from "./api";

export default function Login(props: { onLoggedIn: () => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "bootstrap">("login");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "var(--mantine-color-default-hover)",
      }}
    >
      <Paper shadow="md" p="xl" radius="md" withBorder style={{ maxWidth: 400, width: "100%" }}>
        <Stack gap="lg">
          <Title order={2} ta="center" fw={700}>
            SistemaConnect
          </Title>
          <Text size="sm" c="dimmed" ta="center">
            Iniciá sesión con JWT. Si es la primera vez, usá "Bootstrap admin" para crear el primer usuario.
          </Text>
          <TextInput
            label="Usuario"
            value={username}
            onChange={(e) => setUsername(e.currentTarget.value)}
            placeholder="admin"
          />
          <PasswordInput
            label="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            placeholder="••••••••"
          />
          <Group justify="flex-start">
            <Button variant="filled" disabled={busy} onClick={submit}>
              {busy ? "Procesando..." : mode === "login" ? "Entrar" : "Crear admin + Entrar"}
            </Button>
            <Button
              variant="light"
              disabled={busy}
              onClick={() => setMode(mode === "login" ? "bootstrap" : "login")}
            >
              {mode === "login" ? "Bootstrap admin" : "Volver a login"}
            </Button>
          </Group>
          {error ? (
            <Alert color="red" className="sc-error" title="Error">
              {error}
            </Alert>
          ) : null}
        </Stack>
      </Paper>
    </Box>
  );
}
