import React, { useEffect, useState } from "react";
import {
  Alert,
  Avatar,
  Collapse,
  Divider,
  Group,
  Modal,
  Paper,
  PasswordInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Switch,
  Text,
  TextInput,
  ThemeIcon,
} from "@mantine/core";
import { IconAddressBook, IconId, IconMail, IconMapPin, IconPhone, IconSettings, IconUser } from "@tabler/icons-react";
import { api } from "../api";
import { Button } from "../ui";
import { formatApiError } from "../format";

const IVA_OPTIONS = [
  { value: "1", label: "Responsable Inscripto", invoice: "A" },
  { value: "6", label: "Monotributo", invoice: "A" },
  { value: "4", label: "Exento", invoice: "B" },
  { value: "5", label: "Consumidor Final", invoice: "B" },
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function Section(props: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return (
    <Paper withBorder radius="md" p="md">
      <Group gap="sm" wrap="nowrap" mb="md">
        <ThemeIcon size={36} radius="md" variant="light" color="violet">
          {props.icon}
        </ThemeIcon>
        <div>
          <Text fw={600} size="sm">{props.title}</Text>
          <Text size="xs" c="dimmed">{props.description}</Text>
        </div>
      </Group>
      <Stack gap="sm">{props.children}</Stack>
    </Paper>
  );
}

function SettingRow(props: { title: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="md">
      <div>
        <Text size="sm" fw={500}>{props.title}</Text>
        <Text size="xs" c="dimmed">{props.description}</Text>
      </div>
      <Switch size="md" checked={props.checked} onChange={(e) => props.onChange(e.currentTarget.checked)} />
    </Group>
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

  const iva = IVA_OPTIONS.find((o) => o.value === ivaCondition);

  const header = (
    <Group gap="sm" wrap="nowrap">
      <Avatar radius="xl" color="violet" variant="light">{initials(fullName)}</Avatar>
      <div>
        <Text fw={600}>{fullName || "Editar cliente"}</Text>
        <Text size="xs" c="dimmed">
          Cliente #{props.clientId} · {kind === "PERSON" ? "Persona" : "Empresa"}
        </Text>
      </div>
    </Group>
  );

  return (
    <Modal opened={props.open} onClose={props.onClose} title={header} size="lg" radius="lg" padding="lg">
      {error ? (
        <Alert color="red" className="sc-error" title="Error" mb="md">
          {error}
        </Alert>
      ) : null}
      {loading ? (
        <Stack gap="md">
          <Skeleton height={140} radius="md" />
          <Skeleton height={120} radius="md" />
          <Skeleton height={100} radius="md" />
        </Stack>
      ) : null}

      {!loading && client ? (
        <Stack gap="md">
          <Section icon={<IconUser size={20} />} title="Titular" description="Datos fiscales con los que se factura.">
            <SegmentedControl
              fullWidth
              value={kind}
              onChange={(v) => { const k = v as "PERSON" | "COMPANY"; setKind(k); if (k === "PERSON") setCuit(""); else setDni(""); }}
              data={[{ value: "PERSON", label: "Persona" }, { value: "COMPANY", label: "Empresa" }]}
            />
            <TextInput
              label={kind === "PERSON" ? "Nombre y apellido" : "Razón social"}
              withAsterisk
              value={fullName}
              onChange={(e) => setFullName(e.currentTarget.value)}
              maxLength={200}
            />
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput
                label={kind === "PERSON" ? "DNI" : "CUIT"}
                leftSection={<IconId size={16} />}
                value={kind === "PERSON" ? dni : cuit}
                onChange={(e) => (kind === "PERSON" ? setDni : setCuit)(e.currentTarget.value)}
                maxLength={32}
              />
              <Select
                label="Condición frente al IVA"
                value={ivaCondition}
                onChange={(v) => setIvaCondition(v || "5")}
                data={IVA_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                allowDeselect={false}
                description={iva ? `Se le emite Factura ${iva.invoice}.` : undefined}
                inputWrapperOrder={["label", "input", "description"]}
              />
            </SimpleGrid>
          </Section>

          <Section icon={<IconAddressBook size={20} />} title="Contacto" description="Para avisos, facturas y visitas técnicas.">
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput
                label="Teléfono"
                leftSection={<IconPhone size={16} />}
                value={phone}
                onChange={(e) => setPhone(e.currentTarget.value)}
                maxLength={50}
              />
              <TextInput
                label="Email"
                type="email"
                placeholder="nombre@correo.com"
                leftSection={<IconMail size={16} />}
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                maxLength={200}
              />
            </SimpleGrid>
            <TextInput
              label="Dirección"
              leftSection={<IconMapPin size={16} />}
              value={address}
              onChange={(e) => setAddress(e.currentTarget.value)}
              maxLength={255}
            />
          </Section>

          <Section icon={<IconSettings size={20} />} title="Estado y portal" description="Las conexiones se editan desde la solapa Conexiones.">
            <SettingRow
              title="Cliente activo"
              description="Se muestra como Activo o Inactivo en la ficha del cliente."
              checked={isActive}
              onChange={setIsActive}
            />
            <Divider />
            <SettingRow
              title="Acceso al portal de clientes"
              description="Ve sus facturas y paga online. Entra con su DNI, CUIT o email."
              checked={portalEnabled}
              onChange={setPortalEnabled}
            />
            <Collapse in={portalEnabled}>
              <PasswordInput
                label={portalHasAccount ? "Nueva contraseña (opcional)" : "Contraseña del portal"}
                description={portalHasAccount ? "Dejala vacía para mantener la actual." : "Mínimo 6 caracteres."}
                value={portalPassword}
                onChange={(e) => setPortalPassword(e.currentTarget.value)}
              />
            </Collapse>
          </Section>

          <Group justify="flex-end" gap="sm" mt="xs">
            <Button variant="ghost" disabled={saving} onClick={props.onClose}>Cancelar</Button>
            <Button variant="primary" loading={saving} onClick={save}>Guardar cambios</Button>
          </Group>
        </Stack>
      ) : null}
    </Modal>
  );
}
