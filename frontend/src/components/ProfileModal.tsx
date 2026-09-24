import React, { useEffect, useState } from "react";
import { Alert, Box, Code, Divider, Group, Modal, PasswordInput, PinInput, Stack, Text } from "@mantine/core";
import { api, Me, setToken } from "../api";
import { useMe } from "../auth";
import { formatApiError } from "../format";
import { notifySuccess } from "../notify";
import { Button, Field } from "../ui";

export function ProfileModal(props: { opened: boolean; onClose: () => void; onSaved: (me: Me) => void }) {
  const me = useMe();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [totpBusy, setTotpBusy] = useState(false);
  const [totpSetup, setTotpSetup] = useState<{ secret: string; qr_svg: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");

  useEffect(() => {
    if (!props.opened) return;
    setFirstName(me?.first_name ?? "");
    setLastName(me?.last_name ?? "");
    setEmail(me?.email ?? "");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setTotpSetup(null);
    setTotpCode("");
  }, [props.opened, me?.email, me?.first_name, me?.last_name]);

  async function save() {
    setError(null);
    if (newPassword && newPassword !== confirmPassword) {
      setError("La contraseña nueva y su confirmación no coinciden.");
      return;
    }
    setBusy(true);
    try {
      const next = await api.updateMe({
        current_password: currentPassword,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        new_password: newPassword || undefined,
      });
      if (next.access_token) setToken(next.access_token);
      notifySuccess("Perfil actualizado.");
      props.onSaved(next);
      props.onClose();
    } catch (e: unknown) {
      setError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  async function startTotp() {
    setError(null);
    if (!currentPassword) {
      setError("Poné tu contraseña actual para activar la app.");
      return;
    }
    setTotpBusy(true);
    try {
      const setup = await api.startTotp(currentPassword);
      setTotpSetup({ secret: setup.secret, qr_svg: setup.qr_svg });
      setTotpCode("");
    } catch (e: unknown) {
      setError(formatApiError(e));
    } finally {
      setTotpBusy(false);
    }
  }

  async function confirmTotp(value = totpCode) {
    if (value.length !== 6) return;
    setError(null);
    setTotpBusy(true);
    try {
      const next = await api.confirmTotp(value);
      notifySuccess("App autenticadora activada.");
      setTotpSetup(null);
      setTotpCode("");
      props.onSaved(next);
    } catch (e: unknown) {
      setError(formatApiError(e));
    } finally {
      setTotpBusy(false);
    }
  }

  async function disableTotp() {
    setError(null);
    if (!currentPassword) {
      setError("Poné tu contraseña actual para desactivar la app.");
      return;
    }
    setTotpBusy(true);
    try {
      const next = await api.disableTotp(currentPassword);
      notifySuccess("App autenticadora desactivada. El ingreso vuelve a usar el mail.");
      props.onSaved(next);
    } catch (e: unknown) {
      setError(formatApiError(e));
    } finally {
      setTotpBusy(false);
    }
  }

  return (
    <Modal opened={props.opened} onClose={props.onClose} title="Mi perfil" radius="lg">
      <Stack>
        <Text size="sm" c="dimmed">
          Usuario <b>{me?.username}</b>
          {me?.full_name ? ` · ${me.full_name}` : ""}
          {me?.role ? ` · rol ${me.role.name}` : ""}
        </Text>
        <Group grow align="flex-start">
          <Field label="Nombre" value={firstName} onChange={setFirstName} placeholder="Nombre" />
          <Field label="Apellido" value={lastName} onChange={setLastName} placeholder="Apellido" />
        </Group>
        <Field
          label="Email"
          description={me?.totp_enabled
            ? "Sigue haciendo falta por si no tenés el celular: de respaldo te mandamos el código al mail."
            : "Acá te llega el código de verificación cada vez que ingresás, salvo que actives la app."}
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="nombre@empresa.com"
        />
        <PasswordInput
          label="Contraseña nueva (opcional)"
          description="Mínimo 12 caracteres. Dejala vacía para no cambiarla."
          value={newPassword}
          onChange={(e) => setNewPassword(e.currentTarget.value)}
        />
        {newPassword ? (
          <PasswordInput
            label="Repetí la contraseña nueva"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.currentTarget.value)}
          />
        ) : null}
        <PasswordInput
          label="Contraseña actual"
          description="Necesaria para confirmar cualquier cambio."
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.currentTarget.value)}
          withAsterisk
        />
        <Divider label="App autenticadora" labelPosition="left" />
        {me?.totp_enabled ? (
          <Stack gap="xs">
            <Text size="sm">Ya está activa. En el login te pide el código del celular, no espera el mail.</Text>
            <Button variant="dangerLight" onClick={() => void disableTotp()} loading={totpBusy} disabled={!currentPassword}>
              Desactivar app
            </Button>
          </Stack>
        ) : totpSetup ? (
          <Stack gap="sm" align="center">
            <Text size="sm" ta="center">
              Escaneá este QR con Google Authenticator, Authy o Microsoft Authenticator.
            </Text>
            <Box
              className="sc-totp-qr"
              w={180}
              h={180}
              bg="white"
              p={8}
              style={{ borderRadius: 8, overflow: "hidden" }}
              dangerouslySetInnerHTML={{ __html: totpSetup.qr_svg }}
            />
            <Text size="xs" c="dimmed">Si no podés escanear, cargá esta clave:</Text>
            <Code>{totpSetup.secret}</Code>
            <PinInput
              length={6}
              type="number"
              oneTimeCode
              autoFocus
              value={totpCode}
              onChange={setTotpCode}
              onComplete={(v) => void confirmTotp(v)}
              aria-label="Código de la app"
            />
            <Button variant="primary" onClick={() => void confirmTotp()} loading={totpBusy} disabled={totpCode.length !== 6}>
              Confirmar código
            </Button>
          </Stack>
        ) : (
          <Stack gap="xs">
            <Text size="sm" c="dimmed">
              En vez de esperar el mail, usá el código que genera el celular. El mail queda como respaldo.
            </Text>
            <Button variant="primaryLight" onClick={() => void startTotp()} loading={totpBusy} disabled={!currentPassword}>
              Activar con QR
            </Button>
          </Stack>
        )}
        {error ? <Alert color="red">{error}</Alert> : null}
        <Group justify="flex-end">
          <Button variant="ghost" onClick={props.onClose}>Cancelar</Button>
          <Button variant="primary" onClick={() => void save()} loading={busy} disabled={!currentPassword}>
            Guardar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
