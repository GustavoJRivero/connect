import React, { useEffect, useState } from "react";
import {
  Text,
  TextInput,
  PasswordInput,
  PinInput,
  Stack,
  Paper,
  Anchor,
  Loader,
  UnstyledButton,
  Group,
} from "@mantine/core";
import { api, LoginResponse, setToken } from "./api";
import { formatApiError } from "./format";
import { notifyError, notifySuccess } from "./notify";
import { BrandLogo } from "./BrandLogo";
import { getRecaptchaToken, securityConfig } from "./recaptcha";

type Step = "login" | "bootstrap" | "code";

export default function Login(props: { onLoggedIn: () => void }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [step, setStep] = useState<Step>("login");
  const [challenge, setChallenge] = useState<{ id: string; token: string; hint: string } | null>(null);
  const [code, setCode] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [canBootstrap, setCanBootstrap] = useState(false);

  useEffect(() => {
    let alive = true;
    void securityConfig()
      .then((cfg) => {
        if (alive) setCanBootstrap(Boolean(cfg.bootstrap_available));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  function finish(res: LoginResponse) {
    if (!res.access_token) return;
    setToken(res.access_token);
    props.onLoggedIn();
  }

  async function submitCredentials() {
    if (step === "bootstrap") {
      const captcha = await getRecaptchaToken("staff_bootstrap");
      await api.bootstrap({
        username: identifier.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        password,
        email: email.trim(),
        bootstrapToken,
        recaptchaToken: captcha,
      });
    }
    const captcha = await getRecaptchaToken("staff_login");
    const res = await api.login(identifier.trim(), password, captcha);
    if (!res.require_code || !res.challenge_id || !res.challenge_token) {
      throw new Error("El servidor no pidió el código de verificación. No se puede ingresar.");
    }
    setChallenge({ id: res.challenge_id, token: res.challenge_token, hint: res.email_hint || "tu email" });
    setCode("");
    setResendIn(res.resend_in ?? 30);
    setStep("code");
  }

  async function submitCode(value = code) {
    if (!challenge || value.length !== 6) return;
    const res = await api.verifyLoginCode(challenge.id, challenge.token, value);
    finish(res);
  }

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e: unknown) {
      notifyError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!challenge || resendIn > 0) return;
    await run(async () => {
      const res = await api.resendLoginCode(challenge.id, challenge.token);
      setResendIn(res.resend_in ?? 30);
      setCode("");
      notifySuccess(`Te enviamos un código nuevo a ${challenge.hint}.`, "Código reenviado");
    });
  }

  function backToLogin() {
    setStep("login");
    setChallenge(null);
    setCode("");
    setPassword("");
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
                <Text size="sm" c="dimmed" ta="center">
                  ¿No te llegó? Revisá el correo no deseado o pedí uno nuevo.
                </Text>
                <UnstyledButton
                  type="button"
                  className="sc-login-alt"
                  disabled={busy || resendIn > 0}
                  onClick={() => void resend()}
                >
                  {resendIn > 0 ? `Reenviar código en ${resendIn}s` : "Reenviar código ahora"}
                </UnstyledButton>
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
                  <>
                    <Group grow gap="sm">
                      <TextInput
                        aria-label="Nombre"
                        placeholder="Nombre"
                        value={firstName}
                        onChange={(e) => setFirstName(e.currentTarget.value)}
                        autoComplete="given-name"
                        size="md"
                        radius="md"
                        variant="filled"
                        className="sc-login-field"
                      />
                      <TextInput
                        aria-label="Apellido"
                        placeholder="Apellido"
                        value={lastName}
                        onChange={(e) => setLastName(e.currentTarget.value)}
                        autoComplete="family-name"
                        size="md"
                        radius="md"
                        variant="filled"
                        className="sc-login-field"
                      />
                    </Group>
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
                    <PasswordInput
                      aria-label="Token de instalación"
                      placeholder="Token de instalación"
                      value={bootstrapToken}
                      onChange={(e) => setBootstrapToken(e.currentTarget.value)}
                      autoComplete="off"
                      size="md"
                      radius="md"
                      variant="filled"
                      className="sc-login-field"
                    />
                  </>
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

            <UnstyledButton
              type="submit"
              className="sc-login-go"
              disabled={
                busy
                || (step === "code" && code.length !== 6)
                || (step === "bootstrap"
                  && (!email.trim() || !bootstrapToken.trim() || !firstName.trim() || !lastName.trim()))
              }
            >
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
              <UnstyledButton type="button" className="sc-login-alt" disabled={busy} onClick={backToLogin}>
                Volver
              </UnstyledButton>
            ) : canBootstrap || step === "bootstrap" ? (
              <UnstyledButton
                type="button"
                className="sc-login-alt"
                disabled={busy}
                onClick={() => setStep(step === "login" ? "bootstrap" : "login")}
              >
                {step === "login" ? "Crear primer admin" : "Volver a iniciar sesión"}
              </UnstyledButton>
            ) : null}

            <Text size="sm" c="dimmed" ta="center">
              ¿Sos cliente?{" "}
              <Anchor href="/portal" size="sm">
                Entrar al portal
              </Anchor>
            </Text>

            <Text className="sc-login-legal" size="xs" c="dimmed" ta="center">
              Protegido por reCAPTCHA. Aplican la{" "}
              <Anchor href="https://policies.google.com/privacy" target="_blank" size="xs">
                política de privacidad
              </Anchor>{" "}
              y los{" "}
              <Anchor href="https://policies.google.com/terms" target="_blank" size="xs">
                términos
              </Anchor>{" "}
              de Google.
            </Text>
          </Stack>
        </form>
      </Paper>
    </div>
  );
}
