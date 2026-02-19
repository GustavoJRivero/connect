import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Button, Field } from "../ui";
import {
  Grid,
  Alert,
  Card,
  Title,
  Stack,
  Group,
  Text,
  SegmentedControl,
  NumberInput,
  Badge,
} from "@mantine/core";

export default function SettingsPage() {
  const [issuer, setIssuer] = useState<{ cuit?: string; point_of_sale?: number } | null>(null);
  const [billing, setBilling] = useState<Record<string, string>>({});
  const [smtp, setSmtp] = useState<Record<string, string>>({});
  const [issuerExtra, setIssuerExtra] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cuit, setCuit] = useState("");
  const [pointOfSale, setPointOfSale] = useState("");

  async function reload() {
    setError(null);
    setLoading(true);
    try {
      const res = (await api.getIssuer()) as { cuit?: string; point_of_sale?: number };
      setIssuer(res);
      setCuit(String(res?.cuit ?? ""));
      setPointOfSale(String(res?.point_of_sale ?? ""));

      const billRes = (await api.getSettings("billing.")) as Record<string, string>;
      const mtRes = (await api.getSettings("mikrotik.")) as Record<string, string>;
      const smtpRes = (await api.getSettings("smtp.")) as Record<string, string>;
      const issuerExtraRes = (await api.getSettings("issuer.")) as Record<string, string>;
      setBilling({
        due_days: String(billRes["billing.due_days"] ?? "10"),
        mode: String(billRes["billing.mode"] ?? "GLOBAL").toUpperCase(),
        global_day: String(billRes["billing.global_day"] ?? "1"),
        cut_profile: String(mtRes["mikrotik.cut_profile"] ?? "suspended"),
      });
      setSmtp({
        host: smtpRes["smtp.host"] ?? "",
        port: smtpRes["smtp.port"] ?? "587",
        user: smtpRes["smtp.user"] ?? "",
        password: smtpRes["smtp.password"] ?? "",
        from_email: smtpRes["smtp.from_email"] ?? "",
        use_tls: smtpRes["smtp.use_tls"] ?? "true",
      });
      setIssuerExtra({
        name: issuerExtraRes["issuer.name"] ?? "",
        address: issuerExtraRes["issuer.address"] ?? "",
        phone: issuerExtraRes["issuer.phone"] ?? "",
        email: issuerExtraRes["issuer.email"] ?? "",
      });
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function save() {
    setError(null);
    try {
      await api.putIssuer({ cuit, point_of_sale: Number(pointOfSale) });
      await reload();
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    }
  }

  async function saveBilling() {
    setError(null);
    try {
      await api.putSettings({
        "billing.due_days": billing.due_days ?? "10",
        "billing.mode": billing.mode ?? "GLOBAL",
        "billing.global_day": billing.global_day ?? "1",
        "mikrotik.cut_profile": billing.cut_profile ?? "suspended",
      });
      await reload();
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    }
  }

  async function saveIssuerExtra() {
    setError(null);
    setSuccess(null);
    try {
      await api.putSettings({
        "issuer.name": issuerExtra.name ?? "",
        "issuer.address": issuerExtra.address ?? "",
        "issuer.phone": issuerExtra.phone ?? "",
        "issuer.email": issuerExtra.email ?? "",
      });
      setSuccess("Datos del emisor guardados.");
      await reload();
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    }
  }

  async function saveSmtp() {
    setError(null);
    setSuccess(null);
    try {
      await api.putSettings({
        "smtp.host": smtp.host ?? "",
        "smtp.port": smtp.port ?? "587",
        "smtp.user": smtp.user ?? "",
        "smtp.password": smtp.password ?? "",
        "smtp.from_email": smtp.from_email ?? "",
        "smtp.use_tls": smtp.use_tls ?? "true",
      });
      setSuccess("Configuración SMTP guardada.");
      await reload();
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    }
  }

  const isIndividual = billing.mode === "INDIVIDUAL";

  return (
    <Stack gap="md">
      {error ? (
        <Alert color="red" className="sc-error" title="Error" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      {success ? (
        <Alert color="green" title="Guardado" withCloseButton onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      ) : null}

      <Grid>
        <Grid.Col span={{ base: 12, lg: 6 }}>
          <Card withBorder padding="lg" radius="md">
            <Card.Section withBorder inheritPadding py="sm">
              <Group justify="space-between">
                <Title order={5}>Emisor (AFIP)</Title>
                <Group gap="xs">
                  <Button variant="primary" onClick={save}>
                    Guardar
                  </Button>
                  <Button variant="default" onClick={reload}>
                    Recargar
                  </Button>
                </Group>
              </Group>
            </Card.Section>
            <Stack gap="md" mt="md">
              <Field label="CUIT" value={cuit} onChange={setCuit} />
              <Field label="Punto de venta" value={pointOfSale} onChange={setPointOfSale} />
            </Stack>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 6 }}>
          <Card withBorder padding="lg" radius="md">
            <Card.Section withBorder inheritPadding py="sm">
              <Group justify="space-between">
                <Title order={5}>Cobranza</Title>
                <Button variant="primary" onClick={saveBilling}>
                  Guardar
                </Button>
              </Group>
            </Card.Section>
            <Stack gap="md" mt="md">
              <Text size="sm" c="dimmed">
                Configuración de facturación y corte automático.
              </Text>

              <div>
                <Text size="sm" fw={500} mb={4}>Modo de facturación</Text>
                <SegmentedControl
                  fullWidth
                  value={billing.mode ?? "GLOBAL"}
                  onChange={(v) => setBilling((b) => ({ ...b, mode: v }))}
                  data={[
                    { label: "Global", value: "GLOBAL" },
                    { label: "Individual", value: "INDIVIDUAL" },
                  ]}
                />
                <Text size="xs" c="dimmed" mt={4}>
                  {isIndividual
                    ? "Cada conexión se factura en su propio día (configurado en la conexión)."
                    : "Todas las conexiones se facturan el mismo día del mes."}
                </Text>
              </div>

              {!isIndividual ? (
                <NumberInput
                  label="Día global de facturación"
                  description="Día del mes (1-28) en que se generan todas las facturas."
                  value={Number(billing.global_day) || 1}
                  onChange={(v) => setBilling((b) => ({ ...b, global_day: String(v) }))}
                  min={1}
                  max={28}
                />
              ) : (
                <Alert variant="light" color="blue" title="Modo individual activo">
                  <Text size="sm">
                    El día de facturación se configura en cada conexión del cliente.
                    Podés editarlo desde la ficha del cliente al crear o editar una conexión.
                  </Text>
                </Alert>
              )}

              <Field
                label="Días de vencimiento"
                value={billing.due_days ?? "10"}
                onChange={(v) => setBilling((b) => ({ ...b, due_days: v }))}
                placeholder="ej: 10"
              />
              <Field
                label="Profile de corte (Mikrotik)"
                value={billing.cut_profile ?? "suspended"}
                onChange={(v) => setBilling((b) => ({ ...b, cut_profile: v }))}
                placeholder="ej: suspended"
              />
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>

      <Grid>
        <Grid.Col span={{ base: 12, lg: 6 }}>
          <Card withBorder padding="lg" radius="md">
            <Card.Section withBorder inheritPadding py="sm">
              <Group justify="space-between">
                <Title order={5}>Datos del emisor (PDF)</Title>
                <Button variant="primary" onClick={saveIssuerExtra}>
                  Guardar
                </Button>
              </Group>
            </Card.Section>
            <Stack gap="md" mt="md">
              <Text size="sm" c="dimmed">
                Estos datos aparecen en el encabezado de las facturas PDF.
              </Text>
              <Field
                label="Nombre / Razón social"
                value={issuerExtra.name ?? ""}
                onChange={(v) => setIssuerExtra((s) => ({ ...s, name: v }))}
                placeholder="ej: Connect ISP S.R.L."
              />
              <Field
                label="Dirección"
                value={issuerExtra.address ?? ""}
                onChange={(v) => setIssuerExtra((s) => ({ ...s, address: v }))}
                placeholder="ej: Av. Siempre Viva 742"
              />
              <Field
                label="Teléfono"
                value={issuerExtra.phone ?? ""}
                onChange={(v) => setIssuerExtra((s) => ({ ...s, phone: v }))}
                placeholder="ej: +54 11 1234-5678"
              />
              <Field
                label="Email del emisor"
                value={issuerExtra.email ?? ""}
                onChange={(v) => setIssuerExtra((s) => ({ ...s, email: v }))}
                placeholder="ej: admin@connectisp.com"
              />
            </Stack>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 6 }}>
          <Card withBorder padding="lg" radius="md">
            <Card.Section withBorder inheritPadding py="sm">
              <Group justify="space-between">
                <Title order={5}>Configuración SMTP (Email)</Title>
                <Button variant="primary" onClick={saveSmtp}>
                  Guardar
                </Button>
              </Group>
            </Card.Section>
            <Stack gap="md" mt="md">
              <Text size="sm" c="dimmed">
                Configurá el servidor de correo para enviar facturas por email.
              </Text>
              <Field
                label="Host SMTP"
                value={smtp.host ?? ""}
                onChange={(v) => setSmtp((s) => ({ ...s, host: v }))}
                placeholder="ej: smtp.gmail.com"
              />
              <Field
                label="Puerto"
                value={smtp.port ?? "587"}
                onChange={(v) => setSmtp((s) => ({ ...s, port: v }))}
                placeholder="587"
              />
              <Field
                label="Usuario"
                value={smtp.user ?? ""}
                onChange={(v) => setSmtp((s) => ({ ...s, user: v }))}
                placeholder="ej: no-reply@connectisp.com"
              />
              <Field
                label="Contraseña"
                value={smtp.password ?? ""}
                onChange={(v) => setSmtp((s) => ({ ...s, password: v }))}
                placeholder="••••••••"
              />
              <Field
                label="Email remitente (From)"
                value={smtp.from_email ?? ""}
                onChange={(v) => setSmtp((s) => ({ ...s, from_email: v }))}
                placeholder="ej: facturacion@connectisp.com (vacío = mismo que usuario)"
              />
              <SegmentedControl
                fullWidth
                value={smtp.use_tls === "false" ? "false" : "true"}
                onChange={(v) => setSmtp((s) => ({ ...s, use_tls: v }))}
                data={[
                  { label: "TLS activado", value: "true" },
                  { label: "Sin TLS", value: "false" },
                ]}
              />
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
