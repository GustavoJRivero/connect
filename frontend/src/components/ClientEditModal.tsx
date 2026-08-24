import React, { useEffect, useState } from "react";
import { Modal, Select, Grid, Checkbox, Alert, Group, Stack, Text, Skeleton, PasswordInput, Divider } from "@mantine/core";
import { api } from "../api";
import { Button, Field } from "../ui";
import { formatApiError } from "../format";

export function ClientEditModal(props: {
  open: boolean;
  clientId: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<unknown>(null);
  const [kind, setKind] = useState<"PERSON" | "COMPANY">("PERSON");
  const [fullName, setFullName] = useState("");
  const [dni, setDni] = useState("");
  const [cuit, setCuit] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [portalEnabled, setPortalEnabled] = useState(false);
  const [portalHasAccount, setPortalHasAccount] = useState(false);
  const [portalPassword, setPortalPassword] = useState("");

  useEffect(() => {
    if (!props.open) return;
    setError(null);
    setClient(null);
    if (!props.clientId) return;
    setLoading(true);
    Promise.all([
      api.getClient(Number(props.clientId)),
      api.getClientPortal(Number(props.clientId)).catch(() => ({ enabled: false })),
    ])
      .then(([c, portal]: [any, any]) => {
        const x = c as { kind?: string; full_name?: string; dni?: string; cuit?: string; phone?: string; email?: string; address?: string; is_active?: boolean; portal?: { enabled?: boolean } };
        setClient(c);
        setKind((x?.kind ?? "PERSON").toUpperCase() === "COMPANY" ? "COMPANY" : "PERSON");
        setFullName(String(x?.full_name ?? ""));
        setDni(String(x?.dni ?? ""));
        setCuit(String(x?.cuit ?? ""));
        setPhone(String(x?.phone ?? ""));
        setEmail(String(x?.email ?? ""));
        setAddress(String(x?.address ?? ""));
        setIsActive(Boolean(x?.is_active ?? true));
        const enabled = Boolean(portal?.enabled ?? x?.portal?.enabled);
        setPortalEnabled(enabled);
        setPortalHasAccount(Boolean(portal?.exists ?? portal?.enabled));
        setPortalPassword("");
      })
      .catch((e: unknown) => {
        setError(formatApiError(e));
      })
      .finally(() => setLoading(false));
  }, [props.open, props.clientId]);

  async function save() {
    if (saving) return;
    setError(null);
    if (!props.clientId) return;
    if (!fullName.trim()) {
      setError("Nombre / Razón social es requerido.");
      return;
    }
    if (portalEnabled && !portalHasAccount && portalPassword.trim().length < 6) {
      setError("Para activar el portal hace falta una contraseña de 6+ caracteres.");
      return;
    }
    setSaving(true);
    try {
      await api.updateClient(Number(props.clientId), {
        kind,
        full_name: fullName.trim(),
        dni: kind === "PERSON" ? (dni.trim() || null) : null,
        cuit: kind === "COMPANY" ? (cuit.trim() || null) : null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        is_active: Boolean(isActive),
      });
      if (portalEnabled || portalPassword) {
        await api.upsertClientPortal(Number(props.clientId), {
          enabled: portalEnabled,
          password: portalPassword.trim() || undefined,
        });
      } else if (portalHasAccount && !portalEnabled) {
        await api.upsertClientPortal(Number(props.clientId), { enabled: false });
      }
      props.onSaved();
    } catch (e: unknown) {
      setError(formatApiError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      opened={props.open}
      onClose={props.onClose}
      title={`Editar cliente ${props.clientId ? `#${props.clientId}` : ""}`}
      size="lg"
    >
      {error ? (
        <Alert color="red" className="sc-error" title="Error" mb="md">
          {error}
        </Alert>
      ) : null}
      {loading ? (
        <Stack gap="md">
          <Skeleton height={36} />
          <Skeleton height={36} />
          <Skeleton height={36} />
          <Skeleton height={60} />
        </Stack>
      ) : null}

      {!loading && client ? (
        <>
          <Grid>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Select
                label="Tipo"
                value={kind}
                onChange={(v) => { const k = (v ?? "PERSON") as "PERSON" | "COMPANY"; setKind(k); if (k === "PERSON") setCuit(""); else setDni(""); }}
                data={[{ value: "PERSON", label: "Persona" }, { value: "COMPANY", label: "Empresa" }]}
              />
              <Field label="Nombre / Razón social" required value={fullName} onChange={setFullName} maxLength={200} />
              {kind === "PERSON" ? <Field label="DNI" value={dni} onChange={setDni} maxLength={32} /> : <Field label="CUIT" value={cuit} onChange={setCuit} maxLength={32} />}
              <Grid>
                <Grid.Col span={6}><Field label="Tel/Cel" value={phone} onChange={setPhone} maxLength={50} /></Grid.Col>
                <Grid.Col span={6}><Field label="Email" value={email} onChange={setEmail} maxLength={200} /></Grid.Col>
              </Grid>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Field label="Dirección" value={address} onChange={setAddress} maxLength={255} />
              <Checkbox label="Activo" checked={isActive} onChange={(e) => setIsActive(e.currentTarget.checked)} mt="sm" />
              <Divider my="md" label="Portal de cliente" />
              <Checkbox
                label="Habilitar acceso al portal"
                checked={portalEnabled}
                onChange={(e) => setPortalEnabled(e.currentTarget.checked)}
              />
              <PasswordInput
                mt="sm"
                label={portalHasAccount ? "Nueva contraseña (opcional)" : "Contraseña del portal"}
                description="El cliente entra con DNI/CUIT/email. Mínimo 6 caracteres."
                value={portalPassword}
                onChange={(e) => setPortalPassword(e.currentTarget.value)}
              />
              <Text size="sm" c="dimmed" mt="md">
                Solo se editan datos del titular. Las conexiones se gestionan en la solapa "Conexiones".
              </Text>
            </Grid.Col>
          </Grid>
          <Group justify="flex-end" mt="md">
            <Button variant="default" disabled={saving} onClick={props.onClose}>Cancelar</Button>
            <Button variant="primary" loading={saving} onClick={save}>Guardar</Button>
          </Group>
        </>
      ) : null}
    </Modal>
  );
}
