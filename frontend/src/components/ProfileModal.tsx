import React, { useEffect, useState } from "react";
import { Alert, Group, Modal, PasswordInput, Stack, Text } from "@mantine/core";
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

  useEffect(() => {
    if (!props.opened) return;
    setFirstName(me?.first_name ?? "");
    setLastName(me?.last_name ?? "");
    setEmail(me?.email ?? "");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
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
          description="Acá te llega el código de verificación cada vez que ingresás."
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
