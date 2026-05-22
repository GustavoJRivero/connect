import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Button, Field } from "../ui";
import {
  Accordion,
  ActionIcon,
  Alert,
  Stack,
  Group,
  Text,
  SegmentedControl,
  NumberInput,
  Switch,
  LoadingOverlay,
  Box,
  Tabs,
  Tooltip,
} from "@mantine/core";

type SaveKind = "billing" | "issuerExtra" | "smtp" | "fiscal";

const SAVE_CONFIRM: Record<SaveKind, { title: string; message: string }> = {
  billing: {
    title: "¿Guardar cobranza?",
    message:
      "Se van a guardar en el servidor el modo de facturación, vencimientos, perfil de corte Mikrotik y la programación automática (scheduler). ¿Seguís?",
  },
  issuerExtra: {
    title: "¿Guardar datos del emisor (PDF)?",
    message: "Se actualizarán nombre, dirección, teléfono y email que se muestran en el PDF de facturas. ¿Seguís?",
  },
  smtp: {
    title: "¿Guardar correo SMTP?",
    message: "Se guardará la configuración del servidor de salida (host, usuario, contraseña, etc.) en el servidor. ¿Seguís?",
  },
  fiscal: {
    title: "¿Guardar facturación fiscal?",
    message:
      "Se guardarán CUIT, punto de venta y la configuración AFIP (certificados, ambiente, emisión con CAE). ¿Seguís?",
  },
};

export default function SettingsPage() {
  const [billing, setBilling] = useState<Record<string, string>>({});
  const [smtp, setSmtp] = useState<Record<string, string>>({});
  const [issuerExtra, setIssuerExtra] = useState<Record<string, string>>({});
  const [afip, setAfip] = useState<Record<string, string>>({});
  const [afipEnabled, setAfipEnabled] = useState(false);
  const [afipStatusMsg, setAfipStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cuit, setCuit] = useState("");
  const [pointOfSale, setPointOfSale] = useState("");
  const [schedulerEnabled, setSchedulerEnabled] = useState(false);
  const [schedulerHour, setSchedulerHour] = useState(6);

  async function reload() {
    setError(null);
    setLoading(true);
    try {
      const res = (await api.getIssuer()) as { cuit?: string; point_of_sale?: number };
      setCuit(String(res?.cuit ?? ""));
      setPointOfSale(String(res?.point_of_sale ?? ""));

      const billRes = (await api.getSettings("billing.")) as Record<string, string>;
      const mtRes = (await api.getSettings("mikrotik.")) as Record<string, string>;
      const smtpRes = (await api.getSettings("smtp.")) as Record<string, string>;
      const issuerExtraRes = (await api.getSettings("issuer.")) as Record<string, string>;
      const afipRes = (await api.getSettings("afip.")) as Record<string, string>;
      setBilling({
        due_days: String(billRes["billing.due_days"] ?? "10"),
        mode: String(billRes["billing.mode"] ?? "GLOBAL").toUpperCase(),
        global_day: String(billRes["billing.global_day"] ?? "1"),
        cut_profile: String(mtRes["mikrotik.cut_profile"] ?? "suspended"),
      });
      const schedFlag = String(billRes["billing.scheduler.enabled"] ?? "false").toLowerCase();
      setSchedulerEnabled(["1", "true", "yes", "on"].includes(schedFlag));
      const schedH = parseInt(String(billRes["billing.scheduler.run_hour"] ?? "6"), 10);
      setSchedulerHour(Number.isFinite(schedH) ? Math.min(23, Math.max(0, schedH)) : 6);
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
      const afipFlag = String(afipRes["afip.enabled"] ?? "false").toLowerCase();
      setAfipEnabled(["1", "true", "yes", "on"].includes(afipFlag));
      setAfip({
        env: String(afipRes["afip.env"] ?? "HOMOLOGACION").toUpperCase(),
        cert_path: afipRes["afip.cert_path"] ?? "",
        key_path: afipRes["afip.key_path"] ?? "",
        iva_percent_default: afipRes["afip.iva_percent_default"] ?? "21",
      });
      try {
        const st = (await api.getAfipStatus()) as { status?: string; message?: string };
        const status = String(st?.status ?? "unknown");
        const msg = st?.message ? ` - ${st.message}` : "";
        setAfipStatusMsg(`${status}${msg}`);
      } catch (e: unknown) {
        const err = e as { status?: number; body?: unknown };
        setAfipStatusMsg(`error - ${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
      }
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

  async function saveBilling() {
    setError(null);
    try {
      await api.putSettings({
        "billing.due_days": billing.due_days ?? "10",
        "billing.mode": billing.mode ?? "GLOBAL",
        "billing.global_day": billing.global_day ?? "1",
        "billing.scheduler.enabled": schedulerEnabled ? "true" : "false",
        "billing.scheduler.run_hour": String(schedulerHour),
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

  /** CUIT/PV del emisor + parámetros WSAA/WSFE (mismo CUIT que en comprobantes). */
  async function saveFacturacionFiscal() {
    setError(null);
    setSuccess(null);
    try {
      await api.putIssuer({ cuit, point_of_sale: Number(pointOfSale) });
      await api.putSettings({
        "afip.enabled": afipEnabled ? "true" : "false",
        "afip.env": String(afip.env ?? "HOMOLOGACION").toUpperCase(),
        "afip.cuit": (cuit || "").trim(),
        "afip.cert_path": afip.cert_path ?? "",
        "afip.key_path": afip.key_path ?? "",
        "afip.iva_percent_default": afip.iva_percent_default ?? "21",
      });
      setSuccess("Facturación fiscal guardada (emisor + AFIP).");
      await reload();
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    }
  }

  /** Confirmación antes de persistir (evita depender del portal/stacking del Modal). */
  async function confirmAndSave(kind: SaveKind) {
    const copy = SAVE_CONFIRM[kind];
    const ok = window.confirm(`${copy.title}\n\n${copy.message}`);
    if (!ok) return;
    if (kind === "billing") await saveBilling();
    else if (kind === "issuerExtra") await saveIssuerExtra();
    else if (kind === "smtp") await saveSmtp();
    else await saveFacturacionFiscal();
  }

  const isIndividual = billing.mode === "INDIVIDUAL";

  function sectionHeader(title: string, description: string) {
    return (
      <Stack gap={2}>
        <Text fw={600}>{title}</Text>
        <Text size="xs" c="dimmed" lineClamp={2}>
          {description}
        </Text>
      </Stack>
    );
  }

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

      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm" mb={4}>
        <Text size="sm" c="dimmed" style={{ flex: 1, minWidth: 0 }}>
          Abrí cada bloque para editar. Cada sección tiene su propio guardado. El ícono recarga los datos desde el
          servidor.
        </Text>
        <Tooltip label="Recargar desde el servidor" position="left">
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            radius="md"
            onClick={() => reload()}
            disabled={loading}
            aria-label="Recargar desde el servidor"
          >
            ↻
          </ActionIcon>
        </Tooltip>
      </Group>

      <Box pos="relative">
        <LoadingOverlay visible={loading} zIndex={1} />
        <Accordion multiple defaultValue={[]} variant="separated" radius="md">
          <Accordion.Item value="cobranza">
            <Accordion.Control>
              {sectionHeader(
                "Cobranza",
                "Reglas de facturación, vencimientos, corte en Mikrotik y programación automática.",
              )}
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="md">
                <Group justify="flex-end">
                  <Button variant="primary" onClick={() => void confirmAndSave("billing")}>
                    Guardar cobranza
                  </Button>
                </Group>

                <Tabs defaultValue="reglas" keepMounted={false}>
                  <Tabs.List>
                    <Tabs.Tab value="reglas">Reglas</Tabs.Tab>
                    <Tabs.Tab value="auto">Programación</Tabs.Tab>
                  </Tabs.List>
                  <Tabs.Panel value="reglas" pt="md">
                    <Stack gap="md">
                      <div>
                        <Text size="sm" fw={500} mb={4}>
                          Modo de facturación
                        </Text>
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
                            ? "Cada conexión se factura en su propio día (en la ficha del cliente)."
                            : "Todas las conexiones se facturan el mismo día del mes."}
                        </Text>
                      </div>

                      {!isIndividual ? (
                        <NumberInput
                          label="Día global de facturación"
                          description="Día del mes (1-28)."
                          value={Number(billing.global_day) || 1}
                          onChange={(v) => setBilling((b) => ({ ...b, global_day: String(v) }))}
                          min={1}
                          max={28}
                        />
                      ) : (
                        <Alert variant="light" color="blue" title="Modo individual">
                          <Text size="sm">El día de facturación se edita en cada conexión del cliente.</Text>
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
                  </Tabs.Panel>
                  <Tabs.Panel value="auto" pt="md">
                    <Stack gap="md">
                      <Switch
                        label="Facturación automática (scheduler)"
                        description="Corrida diaria del motor y actualización de cortes. Sin reiniciar el servidor."
                        checked={schedulerEnabled}
                        onChange={(e) => setSchedulerEnabled(e.currentTarget.checked)}
                      />
                      <NumberInput
                        label="Hora de ejecución (UTC)"
                        description="El proceso revisa cada minuto."
                        value={schedulerHour}
                        onChange={(v) =>
                          setSchedulerHour(
                            typeof v === "number" && !Number.isNaN(v) ? Math.min(23, Math.max(0, v)) : 6,
                          )
                        }
                        min={0}
                        max={23}
                      />
                    </Stack>
                  </Tabs.Panel>
                </Tabs>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="pdf">
            <Accordion.Control>
              {sectionHeader("Datos del emisor (PDF)", "Texto que aparece en el encabezado de las facturas en PDF.")}
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="md">
                <Group justify="flex-end">
                  <Button variant="primary" onClick={() => void confirmAndSave("issuerExtra")}>
                    Guardar
                  </Button>
                </Group>
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
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="afip">
            <Accordion.Control>
              {sectionHeader(
                "Facturación fiscal (emisor + AFIP)",
                "CUIT y punto de venta en comprobantes; certificados y WSFE para CAE en facturas A/B.",
              )}
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="md">
                <Text size="sm" c="dimmed">
                  Antes había un bloque aparte solo para CUIT/PV: era lo mismo que el emisor en facturas. Ahora todo
                  queda acá: el CUIT de abajo se guarda también como <code>afip.cuit</code> para WSAA/WSFE.
                </Text>
                <Group justify="space-between" align="center">
                  <Text size="sm" c="dimmed">
                    Estado AFIP: {afipStatusMsg ?? "sin verificar"}
                  </Text>
                  <Group gap="xs">
                    <Button variant="default" onClick={reload}>
                      Verificar estado
                    </Button>
                    <Button variant="primary" onClick={() => void confirmAndSave("fiscal")}>
                      Guardar facturación fiscal
                    </Button>
                  </Group>
                </Group>
                <Field label="CUIT emisor" value={cuit} onChange={setCuit} />
                <Field label="Punto de venta" value={pointOfSale} onChange={setPointOfSale} />
                <Switch
                  label="Emitir A/B con CAE (AFIP)"
                  description="Si está apagado, A/B/X usan numeración interna (sin CAE)."
                  checked={afipEnabled}
                  onChange={(e) => setAfipEnabled(e.currentTarget.checked)}
                />
                <SegmentedControl
                  fullWidth
                  value={String(afip.env ?? "HOMOLOGACION").toUpperCase()}
                  onChange={(v) => setAfip((s) => ({ ...s, env: v }))}
                  data={[
                    { label: "Homologacion", value: "HOMOLOGACION" },
                    { label: "Produccion", value: "PRODUCCION" },
                  ]}
                />
                <Field
                  label="Ruta del certificado (.crt/.pem)"
                  value={afip.cert_path ?? ""}
                  onChange={(v) => setAfip((s) => ({ ...s, cert_path: v }))}
                  placeholder="ej: /app/secrets/cert.pem"
                />
                <Field
                  label="Ruta de la clave privada (.key/.pem)"
                  value={afip.key_path ?? ""}
                  onChange={(v) => setAfip((s) => ({ ...s, key_path: v }))}
                  placeholder="ej: /app/secrets/key.pem"
                />
                <NumberInput
                  label="IVA % por defecto para AFIP"
                  description="Se usa para desglosar neto/IVA al solicitar CAE."
                  value={Number(afip.iva_percent_default ?? "21")}
                  onChange={(v) =>
                    setAfip((s) => ({
                      ...s,
                      iva_percent_default:
                        typeof v === "number" && !Number.isNaN(v) ? String(v) : "21",
                    }))
                  }
                  min={0}
                  max={100}
                  decimalScale={2}
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="smtp">
            <Accordion.Control>
              {sectionHeader("Correo (SMTP)", "Servidor saliente para enviar facturas u otros avisos por email.")}
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="md">
                <Group justify="flex-end">
                  <Button variant="primary" onClick={() => void confirmAndSave("smtp")}>
                    Guardar
                  </Button>
                </Group>
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
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Box>
    </Stack>
  );
}
