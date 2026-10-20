import React, { useEffect, useState } from "react";
import { Modal, Select, Switch, SegmentedControl, SimpleGrid, Alert, Group, Stack, Text, Skeleton, PasswordInput, Divider } from "@mantine/core";
import { api } from "../api";
import { Button, Field } from "../ui";
import { formatApiError } from "../format";

function SectionTitle(props: { children: React.ReactNode }) {
  return (
    <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: 0.5 }}>
      {props.children}
    </Text>
  );
}

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
  const [ivaCondition, setIvaCondition] = useState<string>("5");
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
        const x = c as { kind?: string; iva_condition?: number; full_name?: string; dni?: string; cuit?: string; phone?: string; email?: string; address?: string; is_active?: boolean; portal?: { enabled?: boolean } };
        setClient(c);
        setKind((x?.kind ?? "PERSON").toUpperCase() === "COMPANY" ? "COMPANY" : "PERSON");
        setIvaCondition(String(x?.iva_condition ?? 5));
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
        iva_condition: Number(ivaCondition),
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
        <Stack gap="lg">
          <Stack gap="sm">
            <SectionTitle>Titular</SectionTitle>
            <SegmentedControl
              fullWidth
              value={kind}
              onChange={(v) => { const k = v as "PERSON" | "COMPANY"; setKind(k); if (k === "PERSON") setCuit(""); else setDni(""); }}
              data={[{ value: "PERSON", label: "Persona" }, { value: "COMPANY", label: "Empresa" }]}
            />
            <Field label={kind === "PERSON" ? "Nombre y apellido" : "Razón social"} required value={fullName} onChange={setFullName} maxLength={200} />
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              {kind === "PERSON" ? <Field label="DNI" value={dni} onChange={setDni} maxLength={32} /> : <Field label="CUIT" value={cuit} onChange={setCuit} maxLength={32} />}
              <Select
                label="Condición frente al IVA"
                value={ivaCondition}
                onChange={(v) => setIvaCondition(v || "5")}
                data={[
                  { value: "1", label: "Responsable Inscripto (Factura A)" },
                  { value: "6", label: "Monotributo (Factura A)" },
                  { value: "4", label: "Exento (Factura B)" },
                  { value: "5", label: "Consumidor Final (Factura B)" },
                ]}
              />
            </SimpleGrid>
          </Stack>

          <Stack gap="sm">
            <SectionTitle>Contacto</SectionTitle>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <Field label="Teléfono" value={phone} onChange={setPhone} maxLength={50} />
              <Field label="Email" type="email" value={email} onChange={setEmail} maxLength={200} />
            </SimpleGrid>
            <Field label="Dirección" value={address} onChange={setAddress} maxLength={255} />
          </Stack>

          <Stack gap="sm">
            <SectionTitle>Estado y portal</SectionTitle>
            <Switch
              label="Cliente activo"
              checked={isActive}
              onChange={(e) => setIsActive(e.currentTarget.checked)}
            />
            <Switch
              label="Acceso al portal de clientes"
              description="Entra con su DNI, CUIT o email."
              checked={portalEnabled}
              onChange={(e) => setPortalEnabled(e.currentTarget.checked)}
            />
            {portalEnabled ? (
              <PasswordInput
                label={portalHasAccount ? "Nueva contraseña (opcional)" : "Contraseña del portal"}
                description="Mínimo 6 caracteres."
                value={portalPassword}
                onChange={(e) => setPortalPassword(e.currentTarget.value)}
              />
            ) : null}
          </Stack>

          <Divider />
          <Group justify="space-between">
            <Text size="xs" c="dimmed">Las conexiones se editan desde la solapa "Conexiones".</Text>
            <Group gap="sm">
              <Button variant="default" disabled={saving} onClick={props.onClose}>Cancelar</Button>
              <Button variant="primary" loading={saving} onClick={save}>Guardar</Button>
            </Group>
          </Group>
        </Stack>
      ) : null}
    </Modal>
  );
}
