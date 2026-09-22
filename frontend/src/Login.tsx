import React, { useEffect, useState } from "react";
import {
  Text,
  TextInput,
  PasswordInput,
  PinInput,
  Stack,
  Alert,
  Paper,
  Anchor,
  Loader,
  UnstyledButton,
  Group,
} from "@mantine/core";
import { api, LoginResponse, setToken } from "./api";
import { formatApiError } from "./format";
import { BrandLogo } from "./BrandLogo";

export const CODE_SKIPPED_KEY = "sc.codeSkipped";

type Step = "login" | "bootstrap" | "code";

export default function Login(props: { onLoggedIn: () => void }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<Step>("login");
  const [challenge, setChallenge] = useState<{ id: string; hint: string } | null>(null);
  const [code, setCode] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  function finish(res: LoginResponse) {
    if (!res.access_token) return false;
    setToken(res.access_token);
    if (res.code_skipped) sessionStorage.setItem(CODE_SKIPPED_KEY, res.code_skipped);
    else sessionStorage.removeItem(CODE_SKIPPED_KEY);
    props.onLoggedIn();
    return true;
  }

  async function submitCredentials() {
    if (step === "bootstrap") {
      await api.bootstrap(identifier.trim(), password, email.trim() || undefined);
    }
    const res = await api.login(identifier.trim(), password);
    if (finish(res)) return;
    if (res.require_code && res.challenge_id) {
      setChallenge({ id: res.challenge_id, hint: res.email_hint || "tu email" });
      setCode("");
      setResendIn(res.resend_in ?? 30);
      setStep("code");
    }
  }

  async function submitCode(value = code) {
    if (!challenge || value.length !== 6) return;
    const res = await api.verifyLoginCode(challenge.id, value);
    finish(res);
  }

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await fn();
    } catch (e: unknown) {
      setError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!challenge || resendIn > 0) return;
    await run(async () => {
      const res = await api.resendLoginCode(challenge.id);
      setResendIn(res.resend_in ?? 30);
      setCode("");
      setInfo(`Te enviamos un código nuevo a ${challenge.hint}.`);
    });
  }

  function backToLogin() {
    setStep("login");
    setChallenge(null);
    setCode("");
    setPassword("");
    setError(null);
    setInfo(null);
  }

  const lead =
    step === "code"
      ? `Te enviamos un código de 6 dígitos a ${challenge?.hint}.`
      : step === "login"
        ? "Ingresá con tu email o usuario y tu contraseña."
        : "Creá el primer usuario administrador del sistema.";

  return (
    <div className="sc-login">
      <Paper className="sc-login-card" shadow="md" p="xl" radius="lg" withBorder style={{ maxWidth: 420, width: "100%", overflow: "visible" }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(step === "code" ? () => submitCode() : submitCredentials);
          }}
        >
          <Stack gap="lg">
            <Stack gap={10} align="center" mb={4}>
              <BrandLogo mark={64} stack wordmarkSize={26} />
              <Text className="sc-login-kicker">Panel</Text>
              <Text className="sc-login-lead" ta="center">{lead}</Text>
            </Stack>

            {step === "code" ? (
              <Stack gap="sm" align="center">
                <PinInput
                  length={6}
                  type="number"
                  oneTimeCode
                  autoFocus
                  size="lg"
                  value={code}
                  onChange={setCode}
                  onComplete={(v) => void run(() => submitCode(v))}
                  aria-label="Código de verificación"
                />
                <Text size="xs" c="dimmed">El código vence en 10 minutos.</Text>
              </Stack>
            ) : (
              <Stack gap="sm">
                <TextInput
                  aria-label={step === "bootstrap" ? "Usuario" : "Email o usuario"}
                  placeholder={step === "bootstrap" ? "Usuario" : "Email o usuario"}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.currentTarget.value)}
                  autoFocus
                  autoComplete="username"
                  size="md"
                  radius="md"
                  variant="filled"
                  className="sc-login-field"
                />
                {step === "bootstrap" ? (
                  <TextInput
                    aria-label="Email"
                    placeholder="Email (para recibir el código de ingreso)"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.currentTarget.value)}
                    size="md"
                    radius="md"
                    variant="filled"
                    className="sc-login-field"
                  />
                ) : null}
                <PasswordInput
                  aria-label="Contraseña"
                  placeholder="Contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.currentTarget.value)}
                  autoComplete="current-password"
                  size="md"
                  radius="md"
                  variant="filled"
                  className="sc-login-field"
                />
              </Stack>
            )}

            <UnstyledButton type="submit" className="sc-login-go" disabled={busy || (step === "code" && code.length !== 6)}>
              {busy ? (
                <Loader size="sm" color="white" />
              ) : step === "code" ? (
                "Verificar y entrar"
              ) : step === "login" ? (
                "Entrar"
              ) : (
                "Crear admin y entrar"
              )}
            </UnstyledButton>

            {step === "code" ? (
              <Group justify="space-between">
                <UnstyledButton type="button" className="sc-login-alt" disabled={busy} onClick={backToLogin}>
                  Volver
                </UnstyledButton>
                <UnstyledButton type="button" className="sc-login-alt" disabled={busy || resendIn > 0} onClick={() => void resend()}>
                  {resendIn > 0 ? `Reenviar código (${resendIn}s)` : "Reenviar código"}
                </UnstyledButton>
              </Group>
            ) : (
              <UnstyledButton
                type="button"
                className="sc-login-alt"
                disabled={busy}
                onClick={() => setStep(step === "login" ? "bootstrap" : "login")}
              >
                {step === "login" ? "Crear primer admin" : "Volver a iniciar sesión"}
              </UnstyledButton>
            )}

            {info ? <Alert color="blue" variant="light">{info}</Alert> : null}
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
