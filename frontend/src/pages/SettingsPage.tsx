import React, { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Button, Field, MutedBadge, type BadgeTone } from "../ui";
import { formatApiError, formatArcaMessage } from "../format";
import { notifySuccess } from "../notify";
import { ConfirmDialog, ConfirmState } from "../components/ConfirmDialog";
import {
  ActionIcon,
  Alert,
  Stack,
  Group,
  Text,
  SegmentedControl,
  NumberInput,
  Switch,
  Checkbox,
  TextInput,
  LoadingOverlay,
  Box,
  Tooltip,
  SimpleGrid,
  UnstyledButton,
  Paper,
  Grid,
  PasswordInput,
  Divider,
  Modal,
} from "@mantine/core";
import {
  IconRefresh,
  IconCash,
  IconFileInvoice,
  IconCertificate,
  IconMail,
  IconMapPin,
  IconPlugConnected,
  IconRepeat,
  IconCreditCard,
  IconCircleCheck,
  IconDatabaseImport,
} from "@tabler/icons-react";

type MigrationSummary = {
  plans: number;
  servers: number;
  usuarios: number;
  clients: number;
  merged_clients: number;
  connections: number;
  skipped_connections: number;
  client_status?: Record<string, number>;
  connection_status?: Record<string, number>;
  connections_with_pon_sn?: number;
};

type MigrationStatus = {
  legacy_ready?: boolean;
  legacy_usuarios?: number | null;
  legacy_servicios?: number | null;
  target_clients?: number | null;
  target_connections?: number | null;
  last_filename?: string;
  last_at?: string;
  last_summary?: MigrationSummary | null;
  safety?: SafetyStatus;
};

type SafetyStatus = {
  mikrotik_writes_disabled?: boolean;
  mikrotik_prod_hosts?: string[];
  configured_server_hosts?: string[];
  prod_host_overlap?: string[];
  servers_with_real_credentials?: number;
  staging_safe?: boolean;
};

type SaveKind = "billing" | "services" | "automation" | "issuerExtra" | "smtp" | "fiscal" | "maps" | "mp";
type SectionId = "billing" | "services" | "automation" | "issuer" | "fiscal" | "smtp" | "maps" | "mp" | "migration";

const SAVE_CONFIRM: Record<SaveKind, { title: string; message: string }> = {
  billing: {
    title: "¿Guardar cobranza?",
    message:
      "Se van a guardar el modo de facturación y los vencimientos. ¿Seguís?",
  },
  services: {
    title: "¿Guardar estado de servicios?",
    message: "Se va a guardar el perfil de corte Mikrotik. ¿Seguís?",
  },
  automation: {
    title: "¿Guardar automatización?",
    message:
      "Se van a guardar la generación automática de facturas y la actualización automática de servicios. ¿Seguís?",
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
      "Se guardarán CUIT, punto de venta, ambiente y los certificados de ARCA. ¿Seguís?",
  },
  mp: {
    title: "¿Guardar Mercado Pago?",
    message: "Se guardarán el access token, la public key y la URL de webhook. ¿Seguís?",
  },
  maps: {
    title: "¿Guardar reservas de instalación?",
    message:
      "Se guardará el vencimiento automático de reservas (liberación de puertos NAP, cron y plazo). ¿Seguís?",
  },
};

const SECTIONS: { id: SectionId; label: string; hint: string }[] = [
  { id: "billing", label: "Cobranza", hint: "Ciclo y vencimientos" },
  { id: "automation", label: "Automatización", hint: "Generación de facturas y cortes" },
  { id: "services", label: "Servicios", hint: "Perfil de corte Mikrotik" },
  { id: "issuer", label: "Emisor PDF", hint: "Datos que salen en la factura" },
  { id: "fiscal", label: "ARCA", hint: "CUIT, certificados y CAE" },
  { id: "mp", label: "Mercado Pago", hint: "Cobro desde el portal del cliente" },
  { id: "smtp", label: "Correo", hint: "Envío de facturas por email" },
  { id: "maps", label: "Reservas", hint: "Vencimiento de puertos NAP" },
  { id: "migration", label: "Migración", hint: "Backup del sistema anterior" },
];

const SECTION_ICONS: Record<SectionId, React.ComponentType<{ size?: number | string; stroke?: number | string }>> = {
  billing: IconCash,
  automation: IconRepeat,
  services: IconPlugConnected,
  issuer: IconFileInvoice,
  fiscal: IconCertificate,
  mp: IconCreditCard,
  smtp: IconMail,
  maps: IconMapPin,
  migration: IconDatabaseImport,
};

const SECTION_LOGOS: Partial<Record<SectionId, string>> = {
  fiscal: "/brands/arca.svg",
  mp: "/brands/mercadopago.svg",
};

function BrandLogoMark({ src, alt, size = 22 }: { src: string; alt: string; size?: number }) {
  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      style={{ display: "block", objectFit: "contain", flexShrink: 0, borderRadius: 4 }}
    />
  );
}

function arcaStatusView(raw: { status: string; message: string } | null): {
  tone: BadgeTone;
  title: string;
  detail: string;
  hints: string[];
  technical?: string;
} {
  const status = String(raw?.status ?? "").toLowerCase();
  const message = (raw?.message ?? "").trim();
  if (status === "ok" || status === "ready") {
    return {
      tone: "green",
      title: "Conectado a ARCA",
      detail: message || "WSAA respondió correctamente.",
      hints: [],
    };
  }
  if (status === "error") {
    const parsed = formatArcaMessage(message);
    return { tone: "red", ...parsed };
  }
  if (status === "disabled") {
    return {
      tone: "gray",
      title: "CAE apagado",
      detail: "Podés cargar certificados igual. Se usan al activar la emisión fiscal.",
      hints: [],
    };
  }
  return {
    tone: "gray",
    title: "Sin verificar",
    detail: "Tocá Verificar para comprobar certificados y ambiente con ARCA.",
    hints: [],
  };
}

const IVA_RATES = [
  { label: "21%", value: "21" },
  { label: "10,5%", value: "10.5" },
  { label: "27%", value: "27" },
  { label: "Exento", value: "0" },
];

function normalizeIvaRate(raw: string | undefined): string {
  const n = Number(raw ?? "21");
  if (n === 10.5) return "10.5";
  if (n === 27) return "27";
  if (n === 0) return "0";
  return "21";
}

function CertUploadRow(props: {
  label: string;
  hint: string;
  filename: string;
  ready: boolean;
  pending: File | null;
  accept: string;
  uploadLabel: string;
  replaceLabel: string;
  onPick: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const shown = props.pending?.name || props.filename;
  const ready = props.ready || !!props.pending;
  return (
    <Paper withBorder p="sm" radius="md">
      <input
        ref={inputRef}
        type="file"
        accept={props.accept}
        hidden
        onChange={(e) => {
          props.onPick(e.currentTarget.files?.[0] ?? null);
          e.currentTarget.value = "";
        }}
      />
      <Group justify="space-between" wrap="nowrap" align="center" gap="sm">
        <Box style={{ minWidth: 0, flex: 1 }}>
          <Text size="sm" fw={600}>{props.label}</Text>
          <Text size="xs" c="dimmed" lineClamp={1} mt={2}>
            {shown || props.hint}
          </Text>
        </Box>
        <Group gap={8} wrap="nowrap">
          <MutedBadge tone={props.pending ? "lilac" : ready ? "green" : "gray"} size="sm">
            {props.pending ? "Nuevo" : ready ? "Cargado" : "Falta"}
          </MutedBadge>
          <Button variant={ready ? "default" : "primaryLight"} onClick={() => inputRef.current?.click()}>
            {ready ? props.replaceLabel : props.uploadLabel}
          </Button>
        </Group>
      </Group>
    </Paper>
  );
}

export default function SettingsPage() {
  const [section, setSection] = useState<SectionId | null>(null);

  const [billing, setBilling] = useState<Record<string, string>>({});
  const [smtp, setSmtp] = useState<Record<string, string>>({});
  const [issuerExtra, setIssuerExtra] = useState<Record<string, string>>({});
  const [afip, setAfip] = useState<Record<string, string>>({});
  const [afipEnabled, setAfipEnabled] = useState(false);
  const [afipStatus, setAfipStatus] = useState<{ status: string; message: string } | null>(null);
  const [verifyingArca, setVerifyingArca] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cuit, setCuit] = useState("");
  const [pointOfSale, setPointOfSale] = useState("");
  const [schedulerEnabled, setSchedulerEnabled] = useState(false);
  const [schedulerHour, setSchedulerHour] = useState(6);
  const [servicesEnabled, setServicesEnabled] = useState(false);
  const [cutProfile, setCutProfile] = useState("suspended");
  const [mapsEnabled, setMapsEnabled] = useState(true);
  const [mapsCron, setMapsCron] = useState("0 * * * *");
  const [mapsTtl, setMapsTtl] = useState(168);
  const [arcaCertFile, setArcaCertFile] = useState<File | null>(null);
  const [arcaKeyFile, setArcaKeyFile] = useState<File | null>(null);
  const [arcaCertReady, setArcaCertReady] = useState(false);
  const [arcaKeyReady, setArcaKeyReady] = useState(false);
  const [arcaCertName, setArcaCertName] = useState("");
  const [arcaKeyName, setArcaKeyName] = useState("");
  const [mp, setMp] = useState({ access_token: "", public_key: "", webhook_url: "" });
  const [mpTokenReady, setMpTokenReady] = useState(false);
  const [mpTokenSource, setMpTokenSource] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [issue, setIssue] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [generateResult, setGenerateResult] = useState<{ created: number; errors: unknown[] } | null>(null);
  const [updateResult, setUpdateResult] = useState<{ cut: number[]; restored: number[] } | null>(null);
  const [billingStatus, setBillingStatus] = useState<{ active_connections?: number; overdue_invoices?: number } | null>(null);
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatus | null>(null);
  const [migrationFile, setMigrationFile] = useState<File | null>(null);
  const [migrationUploading, setMigrationUploading] = useState(false);
  const [migrationApplying, setMigrationApplying] = useState(false);
  const migrationInputRef = useRef<HTMLInputElement>(null);

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
      });
      const schedFlag = String(billRes["billing.scheduler.enabled"] ?? "false").toLowerCase();
      const schedOn = ["1", "true", "yes", "on"].includes(schedFlag);
      setSchedulerEnabled(schedOn);
      const schedH = parseInt(String(billRes["billing.scheduler.run_hour"] ?? "6"), 10);
      setSchedulerHour(Number.isFinite(schedH) ? Math.min(23, Math.max(0, schedH)) : 6);
      setCutProfile(String(mtRes["mikrotik.cut_profile"] ?? "suspended"));
      const svcRaw = billRes["billing.services.enabled"];
      if (svcRaw == null || String(svcRaw).trim() === "") {
        setServicesEnabled(schedOn);
      } else {
        setServicesEnabled(["1", "true", "yes", "on"].includes(String(svcRaw).toLowerCase()));
      }
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
      try {
        const mpRes = (await api.getSettings("mp.")) as Record<string, string>;
        setMp({
          access_token: "",
          public_key: mpRes["mp.public_key"] ?? "",
          webhook_url: mpRes["mp.webhook_url"] ?? "",
        });
        setMpTokenReady(String(mpRes["mp.access_token_ready"] ?? "").toLowerCase() === "true");
        setMpTokenSource(mpRes["mp.access_token_source"] ?? "");
      } catch {
        setMp({ access_token: "", public_key: "", webhook_url: "" });
        setMpTokenReady(false);
        setMpTokenSource("");
      }

      const mapsRes = (await api.getSettings("maps.")) as Record<string, string>;
      const mapsFlag = String(mapsRes["maps.reservation.enabled"] ?? "true").toLowerCase();
      setMapsEnabled(["1", "true", "yes", "on"].includes(mapsFlag));
      setMapsCron(mapsRes["maps.reservation.cron"] ?? "0 * * * *");
      const ttl = parseInt(String(mapsRes["maps.reservation.ttl_hours"] ?? "168"), 10);
      setMapsTtl(Number.isFinite(ttl) && ttl > 0 ? ttl : 168);

      const afipFlag = String(afipRes["afip.enabled"] ?? "false").toLowerCase();
      setAfipEnabled(["1", "true", "yes", "on"].includes(afipFlag));
      setAfip({
        env: String(afipRes["afip.env"] ?? "HOMOLOGACION").toUpperCase(),
        iva_percent_default: afipRes["afip.iva_percent_default"] ?? "21",
      });
      setArcaCertReady(String(afipRes["afip.cert_ready"] ?? "").toLowerCase() === "true");
      setArcaKeyReady(String(afipRes["afip.key_ready"] ?? "").toLowerCase() === "true");
      setArcaCertName(afipRes["afip.cert_filename"] ?? "");
      setArcaKeyName(afipRes["afip.key_filename"] ?? "");
      setArcaCertFile(null);
      setArcaKeyFile(null);
      try {
        const st = (await api.getBillingStatus()) as { active_connections?: number; overdue_invoices?: number };
        setBillingStatus(st);
      } catch {
        setBillingStatus(null);
      }
      try {
        const mig = (await api.getMigrationStatus()) as MigrationStatus;
        setMigrationStatus(mig);
      } catch {
        setMigrationStatus(null);
      }
    } catch (e: unknown) {
      setError(formatApiError(e));
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
      });
      notifySuccess("Cobranza guardada.");
      setSection(null);
      await reload();
    } catch (e: unknown) {
      setError(formatApiError(e));
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
      notifySuccess("Datos del emisor guardados.");
      setSection(null);
      await reload();
    } catch (e: unknown) {
      setError(formatApiError(e));
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
      notifySuccess("Configuración SMTP guardada.");
      setSection(null);
      await reload();
    } catch (e: unknown) {
      setError(formatApiError(e));
    }
  }

  async function saveFacturacionFiscal() {
    setError(null);
    setSuccess(null);
    try {
      if (arcaCertFile || arcaKeyFile) {
        await api.uploadArcaCerts({ cert: arcaCertFile, key: arcaKeyFile });
      }
      await api.putIssuer({ cuit, point_of_sale: Number(pointOfSale) });
      await api.putSettings({
        "afip.enabled": afipEnabled ? "true" : "false",
        "afip.env": String(afip.env ?? "HOMOLOGACION").toUpperCase(),
        "afip.cuit": (cuit || "").trim(),
        "afip.iva_percent_default": afip.iva_percent_default ?? "21",
      });
      setSuccess("Facturación fiscal guardada (emisor + ARCA).");
      notifySuccess("Facturación fiscal guardada (emisor + ARCA).");
      setSection(null);
      await reload();
    } catch (e: unknown) {
      setError(formatApiError(e));
    }
  }

  async function saveServices() {
    setError(null);
    setSuccess(null);
    try {
      await api.putSettings({
        "mikrotik.cut_profile": cutProfile.trim() || "suspended",
      });
      setSuccess("Estado de servicios guardado.");
      notifySuccess("Estado de servicios guardado.");
      setSection(null);
      await reload();
    } catch (e: unknown) {
      setError(formatApiError(e));
    }
  }

  async function saveAutomation() {
    setError(null);
    setSuccess(null);
    try {
      await api.putSettings({
        "billing.scheduler.enabled": schedulerEnabled ? "true" : "false",
        "billing.scheduler.run_hour": String(schedulerHour),
        "billing.services.enabled": servicesEnabled ? "true" : "false",
      });
      setSuccess("Automatización guardada.");
      notifySuccess("Automatización guardada.");
      setSection(null);
      await reload();
    } catch (e: unknown) {
      setError(formatApiError(e));
    }
  }

  async function saveMp() {
    setError(null);
    setSuccess(null);
    try {
      const values: Record<string, string> = {
        "mp.public_key": mp.public_key.trim(),
        "mp.webhook_url": mp.webhook_url.trim(),
      };
      if (mp.access_token.trim()) values["mp.access_token"] = mp.access_token.trim();
      await api.putSettings(values);
      setSuccess("Mercado Pago guardado.");
      notifySuccess("Mercado Pago guardado.");
      setSection(null);
      await reload();
    } catch (e: unknown) {
      setError(formatApiError(e));
    }
  }

  async function saveMaps() {
    setError(null);
    setSuccess(null);
    try {
      await api.putSettings({
        "maps.reservation.enabled": mapsEnabled ? "true" : "false",
        "maps.reservation.cron": mapsCron.trim() || "0 * * * *",
        "maps.reservation.ttl_hours": String(mapsTtl || 168),
      });
      setSuccess("Ajustes de reservas guardados.");
      notifySuccess("Ajustes de reservas guardados.");
      setSection(null);
      await reload();
    } catch (e: unknown) {
      setError(formatApiError(e));
    }
  }

  async function verifyArca() {
    setError(null);
    setVerifyingArca(true);
    try {
      const st = (await api.getAfipStatus()) as { status?: string; message?: string };
      setAfipStatus({
        status: String(st?.status ?? "unknown"),
        message: String(st?.message ?? ""),
      });
    } catch (e: unknown) {
      setAfipStatus({ status: "error", message: formatApiError(e) });
    } finally {
      setVerifyingArca(false);
    }
  }

  async function previewExistingMigration() {
    setError(null);
    setSuccess(null);
    setMigrationUploading(true);
    try {
      const res = (await api.previewMigration()) as { summary?: MigrationSummary };
      setMigrationStatus((prev) => ({
        ...(prev ?? {}),
        legacy_ready: true,
        last_at: new Date().toISOString(),
        last_summary: res.summary ?? null,
      }));
      notifySuccess("Backup analizado.");
    } catch (e: unknown) {
      setError(formatApiError(e));
    } finally {
      setMigrationUploading(false);
    }
  }

  async function uploadMigrationBackup() {
    if (!migrationFile) {
      setError("Seleccioná el archivo .sql del backup.");
      return;
    }
    setError(null);
    setSuccess(null);
    setMigrationUploading(true);
    try {
      const res = (await api.uploadMigrationBackup(migrationFile)) as {
        filename?: string;
        summary?: MigrationSummary;
      };
      setMigrationFile(null);
      setMigrationStatus((prev) => ({
        ...(prev ?? {}),
        legacy_ready: true,
        last_filename: res.filename ?? migrationFile.name,
        last_at: new Date().toISOString(),
        last_summary: res.summary ?? null,
      }));
      notifySuccess("Backup importado. Revisá el resumen antes de aplicar.");
    } catch (e: unknown) {
      setError(formatApiError(e));
    } finally {
      setMigrationUploading(false);
    }
  }

  function confirmApplyMigration() {
    const summary = migrationStatus?.last_summary;
    setConfirm({
      title: "¿Importar clientes desde el backup?",
      message: summary ? (
        <Stack gap={6}>
          <Text size="sm">
            Se reemplazarán clientes, conexiones, planes y servidores actuales con los datos del backup analizado.
          </Text>
          <Text size="sm" fw={600}>
            {summary.clients} clientes · {summary.connections} conexiones · {summary.plans} planes · {summary.servers} servidores
          </Text>
          <Text size="xs" c="dimmed">Esta acción no se puede deshacer.</Text>
        </Stack>
      ) : (
        "Se reemplazarán clientes, conexiones, planes y servidores actuales. Esta acción no se puede deshacer."
      ),
      confirmLabel: "Importar",
      danger: true,
      onConfirm: async () => {
        setError(null);
        setSuccess(null);
        setMigrationApplying(true);
        try {
          const res = (await api.applyMigration()) as { summary?: MigrationSummary };
          setSuccess("Migración aplicada correctamente.");
          notifySuccess("Clientes y conexiones importados.");
          if (res.summary) {
            setMigrationStatus((prev) => ({
              ...(prev ?? {}),
              target_clients: res.summary?.clients ?? prev?.target_clients,
              target_connections: res.summary?.connections ?? prev?.target_connections,
              last_summary: res.summary ?? prev?.last_summary ?? null,
            }));
          }
          await reload();
        } catch (e: unknown) {
          setError(formatApiError(e));
        } finally {
          setMigrationApplying(false);
        }
      },
    });
  }

  function confirmAndSave(kind: SaveKind) {
    const copy = SAVE_CONFIRM[kind];
    setConfirm({
      title: copy.title,
      message: copy.message,
      confirmLabel: "Guardar",
      onConfirm: async () => {
        if (kind === "billing") await saveBilling();
        else if (kind === "services") await saveServices();
        else if (kind === "automation") await saveAutomation();
        else if (kind === "issuerExtra") await saveIssuerExtra();
        else if (kind === "smtp") await saveSmtp();
        else if (kind === "maps") await saveMaps();
        else if (kind === "mp") await saveMp();
        else await saveFacturacionFiscal();
      },
    });
  }

  const isIndividual = billing.mode === "INDIVIDUAL";
  const current = SECTIONS.find((s) => s.id === section) ?? null;
  const arcaView = arcaStatusView(afipStatus);

  const tileSummary: Record<SectionId, { line: string; tone: "green" | "yellow" | "gray" | "red" | "lilac"; badge: string }> = {
    billing: {
      line: isIndividual
        ? "Facturación individual"
        : `Global · día ${billing.global_day || "1"} · vence ${billing.due_days || "10"}d`,
      tone: "lilac",
      badge: isIndividual ? "Individual" : "Global",
    },
    automation: {
      line: [
        schedulerEnabled ? "Facturas auto" : "Facturas manual",
        servicesEnabled ? "servicios auto" : "servicios manual",
      ].join(" · "),
      tone: schedulerEnabled || servicesEnabled ? "green" : "gray",
      badge: schedulerEnabled || servicesEnabled ? `${schedulerHour}:00` : "Manual",
    },
    services: {
      line: cutProfile.trim() ? `Perfil ${cutProfile}` : "Sin perfil de corte",
      tone: cutProfile.trim() ? "lilac" : "gray",
      badge: cutProfile.trim() || "Vacío",
    },
    issuer: {
      line: issuerExtra.name?.trim() || "Sin razón social",
      tone: issuerExtra.name?.trim() ? "lilac" : "gray",
      badge: issuerExtra.name?.trim() ? "Cargado" : "Vacío",
    },
    fiscal: {
      line: cuit ? `CUIT ${cuit}${pointOfSale ? ` · PV ${pointOfSale}` : ""}` : "Sin CUIT",
      tone: afipEnabled ? (arcaCertReady && arcaKeyReady ? "green" : "yellow") : "gray",
      badge: afipEnabled
        ? (arcaCertReady && arcaKeyReady ? "Certificados listos" : "Faltan certificados")
        : "Sin CAE",
    },
    mp: {
      line: mpTokenReady
        ? (mpTokenSource === "env" ? "Credenciales desde el entorno" : "Credenciales cargadas")
        : "Access token, public key y webhook",
      tone: mpTokenReady && mp.public_key.trim() ? "green" : mpTokenReady || mp.public_key.trim() ? "yellow" : "gray",
      badge: mpTokenReady && mp.public_key.trim() ? "Listo" : "No configurado",
    },
    smtp: {
      line: smtp.host?.trim() || "Sin servidor",
      tone: smtp.host?.trim() ? "green" : "gray",
      badge: smtp.host?.trim() ? (smtp.use_tls === "false" ? "Sin TLS" : "TLS") : "No configurado",
    },
    maps: {
      line: mapsEnabled ? `Vence a las ${mapsTtl} h` : "Liberación automática apagada",
      tone: mapsEnabled ? "green" : "gray",
      badge: mapsEnabled ? mapsCron : "Manual",
    },
    migration: {
      line: migrationStatus?.last_filename
        ? migrationStatus.last_filename
        : migrationStatus?.legacy_ready
          ? "Backup cargado en legacy"
          : "Subí el .sql de MikroWisp",
      tone: migrationStatus?.last_summary ? "green" : migrationStatus?.legacy_ready ? "yellow" : "gray",
      badge: migrationStatus?.last_summary
        ? `${migrationStatus.last_summary.clients} clientes`
        : migrationStatus?.legacy_ready
          ? "Sin analizar"
          : "Sin backup",
    },
  };

  return (
    <Stack gap="md">
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
      {error ? (
        <Alert color="red" title="Error" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}
      {success ? (
        <Alert color="green" title="Guardado" withCloseButton onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      ) : null}

      <Box pos="relative">
        <LoadingOverlay visible={loading} zIndex={1} />

        <Group justify="space-between" align="center" mb="sm">
          <Text size="sm" c="dimmed">
            Abrí una tarjeta para editar. Hay que cerrar la ventana para pasar a otra sección.
          </Text>
          <Tooltip label="Recargar desde el servidor">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="lg"
              onClick={() => reload()}
              disabled={loading}
              aria-label="Recargar desde el servidor"
            >
              <IconRefresh size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          {SECTIONS.map((s) => {
            const Icon = SECTION_ICONS[s.id];
            const logo = SECTION_LOGOS[s.id];
            const info = tileSummary[s.id];
            return (
              <UnstyledButton key={s.id} onClick={() => setSection(s.id)}>
                <Paper withBorder p="sm" radius="md" h="100%">
                  <Group gap={8} wrap="nowrap" mb={6}>
                    {logo ? <BrandLogoMark src={logo} alt="" size={22} /> : <Icon size={18} stroke={1.7} />}
                    <Text fw={600} size="sm">{s.label}</Text>
                  </Group>
                  <Text size="xs" c="dimmed" lineClamp={2} mb={8}>{info.line}</Text>
                  <MutedBadge tone={info.tone} size="sm">{info.badge}</MutedBadge>
                </Paper>
              </UnstyledButton>
            );
          })}
        </SimpleGrid>

        <Modal
          opened={section != null}
          onClose={() => setSection(null)}
          title={current ? (
            <Group gap={10} wrap="nowrap" align="center">
              {SECTION_LOGOS[current.id] ? (
                <BrandLogoMark src={SECTION_LOGOS[current.id]!} alt="" size={32} />
              ) : null}
              <div>
                <Text fw={600}>{current.label}</Text>
                <Text size="sm" c="dimmed" fw={400}>{current.hint}</Text>
              </div>
            </Group>
          ) : null}
          size={section === "fiscal" || section === "mp" || section === "migration" ? "xl" : "lg"}
          centered
          closeOnClickOutside
          closeOnEscape
        >
          {error ? (
            <Alert color="red" title="Error" withCloseButton onClose={() => setError(null)} mb="md">
              {error}
            </Alert>
          ) : null}

          {section === "billing" ? (
            <Stack gap="lg">
              <div>
                <Text size="sm" fw={500} mb={6}>Modo de facturación</Text>
                <SegmentedControl
                  value={billing.mode ?? "GLOBAL"}
                  onChange={(v) => setBilling((b) => ({ ...b, mode: v }))}
                  data={[
                    { label: "Global (mismo día)", value: "GLOBAL" },
                    { label: "Individual (por conexión)", value: "INDIVIDUAL" },
                  ]}
                />
                <Text size="xs" c="dimmed" mt={6}>
                  {isIndividual
                    ? "Cada conexión se factura en su propio día, en la ficha del cliente."
                    : "Todas las conexiones se facturan el mismo día del mes."}
                </Text>
              </div>

              <Grid>
                <Grid.Col span={{ base: 12, sm: 6 }}>
                  {isIndividual ? (
                    <Alert variant="light" color="violet" title="Modo individual">
                      <Text size="sm">El día de facturación se edita en cada conexión del cliente.</Text>
                    </Alert>
                  ) : (
                    <NumberInput
                      label="Día global de facturación"
                      description="Día del mes (1–28)."
                      value={Number(billing.global_day) || 1}
                      onChange={(v) => setBilling((b) => ({ ...b, global_day: String(v) }))}
                      min={1}
                      max={28}
                    />
                  )}
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6 }}>
                  <NumberInput
                    label="Días de vencimiento"
                    description="Desde la emisión hasta el vencimiento."
                    value={Number(billing.due_days) || 10}
                    onChange={(v) => setBilling((b) => ({ ...b, due_days: String(v || 10) }))}
                    min={0}
                    max={90}
                  />
                </Grid.Col>
              </Grid>
              <Group justify="flex-end" mt="xs">
                <Button variant="default" onClick={() => setSection(null)}>Cerrar</Button>
                <Button variant="primary" onClick={() => void confirmAndSave("billing")}>Guardar cobranza</Button>
              </Group>
            </Stack>
          ) : null}

          {section === "automation" ? (
            <Stack gap="md">
              <Switch
                label="Generar facturas automáticamente"
                description="Corre el motor todos los días, sin reiniciar el servidor."
                checked={schedulerEnabled}
                onChange={(e) => setSchedulerEnabled(e.currentTarget.checked)}
              />
              <Switch
                label="Actualizar estado de servicios automáticamente"
                description="Revisa vencidas y corta o restaura conexiones a la misma hora."
                checked={servicesEnabled}
                onChange={(e) => setServicesEnabled(e.currentTarget.checked)}
              />
              <NumberInput
                label="Hora de ejecución (hora local)"
                description="El proceso revisa cada minuto y corre a partir de esta hora."
                value={schedulerHour}
                onChange={(v) =>
                  setSchedulerHour(typeof v === "number" && !Number.isNaN(v) ? Math.min(23, Math.max(0, v)) : 6)
                }
                min={0}
                max={23}
                disabled={!schedulerEnabled && !servicesEnabled}
                maw={220}
              />
              <Group justify="flex-end">
                <Button variant="primary" onClick={() => void confirmAndSave("automation")}>Guardar automatización</Button>
              </Group>

              <Divider label="Ejecutar ahora" labelPosition="center" />

              <TextInput
                label="Fecha de emisión (opcional)"
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.currentTarget.value)}
              />
              <Checkbox
                label="Emitir directamente (visible para cobrar)"
                checked={issue}
                onChange={(e) => setIssue(e.currentTarget.checked)}
              />
              <Group>
                <Button
                  variant="primaryLight"
                  loading={generating}
                  onClick={() => {
                    const n = billingStatus?.active_connections;
                    setConfirm({
                      title: "Generar facturas del período",
                      message: `Se van a generar facturas para ${n != null ? `${n} conexiones activas` : "todas las conexiones activas"} del período actual (las ya facturadas se omiten). Fecha: ${issueDate || "hoy"}. Estado: ${issue ? "emitida" : "borrador"}.`,
                      confirmLabel: "Generar facturas",
                      onConfirm: async () => {
                        setError(null);
                        setGenerateResult(null);
                        setGenerating(true);
                        try {
                          const payload: { issue?: boolean; issue_date?: string } = { issue };
                          if (issueDate) payload.issue_date = issueDate;
                          const res = (await api.generateBilling(payload)) as { created: number; errors: unknown[] };
                          setGenerateResult(res);
                          notifySuccess(`Se ${res.created === 1 ? "creó 1 factura" : `crearon ${res.created} facturas`}.`, "Facturación generada");
                          await reload();
                        } catch (e: unknown) {
                          setError(formatApiError(e));
                        } finally {
                          setGenerating(false);
                        }
                      },
                    });
                  }}
                >
                  Generar facturas
                </Button>
                <Button
                  variant="dangerLight"
                  loading={updating}
                  onClick={() => {
                    setConfirm({
                      title: "Actualizar estado de servicios",
                      message: `Se revisarán las facturas vencidas pendientes${billingStatus?.overdue_invoices != null ? ` (${billingStatus.overdue_invoices} actualmente)` : ""} y se cortarán las conexiones con deuda. Las que estén al día se restauran.`,
                      confirmLabel: "Actualizar servicios",
                      danger: true,
                      onConfirm: async () => {
                        setError(null);
                        setUpdateResult(null);
                        setUpdating(true);
                        try {
                          const res = (await api.updateServices()) as { cut: number[]; restored: number[] };
                          setUpdateResult(res);
                          notifySuccess(`Cortadas: ${res.cut.length} · Restauradas: ${res.restored.length}`, "Servicios actualizados");
                          await reload();
                        } catch (e: unknown) {
                          setError(formatApiError(e));
                        } finally {
                          setUpdating(false);
                        }
                      },
                    });
                  }}
                >
                  Actualizar servicios
                </Button>
              </Group>
              {generateResult ? (
                <Alert color={generateResult.errors.length > 0 ? "yellow" : "green"} title="Facturas">
                  <Text size="sm">Creadas: {generateResult.created}{generateResult.errors.length > 0 ? ` · Errores: ${generateResult.errors.length}` : ""}</Text>
                </Alert>
              ) : null}
              {updateResult ? (
                <Alert color="violet" title="Servicios">
                  <Text size="sm">Cortadas: {updateResult.cut.length} · Restauradas: {updateResult.restored.length}</Text>
                </Alert>
              ) : null}
              <Group justify="flex-end">
                <Button variant="default" onClick={() => setSection(null)}>Cerrar</Button>
              </Group>
            </Stack>
          ) : null}

          {section === "services" ? (
            <Stack gap="md">
              <Field
                label="Profile de corte (Mikrotik)"
                value={cutProfile}
                onChange={setCutProfile}
                placeholder="ej: suspended"
              />
              <Text size="xs" c="dimmed">
                La actualización automática de cortes está en Automatización.
              </Text>
              <Group justify="flex-end">
                <Button variant="default" onClick={() => setSection(null)}>Cerrar</Button>
                <Button variant="primary" onClick={() => void confirmAndSave("services")}>Guardar servicios</Button>
              </Group>
            </Stack>
          ) : null}

          {section === "issuer" ? (
            <Stack gap="md">
              <Grid>
                <Grid.Col span={{ base: 12, sm: 6 }}>
                  <Field
                    label="Nombre / Razón social"
                    value={issuerExtra.name ?? ""}
                    onChange={(v) => setIssuerExtra((s) => ({ ...s, name: v }))}
                    placeholder="ej: Connect ISP S.R.L."
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6 }}>
                  <Field
                    label="Teléfono"
                    value={issuerExtra.phone ?? ""}
                    onChange={(v) => setIssuerExtra((s) => ({ ...s, phone: v }))}
                    placeholder="ej: +54 11 1234-5678"
                  />
                </Grid.Col>
                <Grid.Col span={12}>
                  <Field
                    label="Dirección"
                    value={issuerExtra.address ?? ""}
                    onChange={(v) => setIssuerExtra((s) => ({ ...s, address: v }))}
                    placeholder="ej: Av. Siempre Viva 742"
                  />
                </Grid.Col>
                <Grid.Col span={12}>
                  <Field
                    label="Email del emisor"
                    value={issuerExtra.email ?? ""}
                    onChange={(v) => setIssuerExtra((s) => ({ ...s, email: v }))}
                    placeholder="ej: admin@connectisp.com"
                  />
                </Grid.Col>
              </Grid>
              <Group justify="flex-end">
                <Button variant="default" onClick={() => setSection(null)}>Cerrar</Button>
                <Button variant="primary" onClick={() => void confirmAndSave("issuerExtra")}>Guardar emisor</Button>
              </Group>
            </Stack>
          ) : null}

          {section === "fiscal" ? (
            <Stack gap="lg">
              <Paper withBorder p="sm" radius="md">
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Group gap="sm" wrap="nowrap" align="flex-start">
                    <BrandLogoMark src="/brands/arca.svg" alt="ARCA" size={42} />
                    <Box>
                      <Group gap={8} mb={2}>
                        <Text size="sm" fw={600}>{arcaView.title}</Text>
                        <MutedBadge tone={arcaView.tone} size="sm">
                          {afipEnabled ? (afip.env === "PRODUCCION" ? "Producción" : "Homologación") : "Interno"}
                        </MutedBadge>
                      </Group>
                      {afipStatus?.status !== "error" ? (
                        <Text size="sm" c="dimmed" maw={480}>{arcaView.detail}</Text>
                      ) : null}
                    </Box>
                  </Group>
                  <Tooltip label="Verificar conexión con ARCA">
                    <ActionIcon
                      variant="light"
                      color="violet"
                      size="lg"
                      loading={verifyingArca}
                      onClick={() => void verifyArca()}
                      aria-label="Verificar ARCA"
                    >
                      <IconRefresh size={18} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Paper>

              {afipStatus?.status === "error" ? (
                <Alert color="red" variant="outline" title={arcaView.title}>
                  <Text size="sm" mb="sm">{arcaView.detail}</Text>
                  {arcaView.hints.length > 0 ? (
                    <Stack gap={6}>
                      <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: "0.05em" }}>
                        Qué revisar
                      </Text>
                      {arcaView.hints.map((hint) => (
                        <Text key={hint} size="sm" lh={1.45}>• {hint}</Text>
                      ))}
                    </Stack>
                  ) : null}
                  {arcaView.technical ? (
                    <Text size="xs" c="dimmed" mt="md" style={{ wordBreak: "break-word" }}>
                      Detalle técnico: {arcaView.technical}
                    </Text>
                  ) : null}
                </Alert>
              ) : null}

              {afipStatus?.status === "ok" ? (
                <Alert color="teal" variant="outline" title="Conexión OK" icon={<IconCircleCheck size={18} />}>
                  <Text size="sm">{arcaView.detail}</Text>
                </Alert>
              ) : null}

              <div>
                <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb={8} style={{ letterSpacing: "0.06em" }}>
                  Datos fiscales
                </Text>
                <Grid>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <Field label="CUIT emisor" value={cuit} onChange={setCuit} placeholder="20-12345678-9" />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <Field label="Punto de venta" value={pointOfSale} onChange={setPointOfSale} placeholder="1" />
                  </Grid.Col>
                </Grid>
              </div>

              <Paper withBorder p="md" radius="md">
                <Switch
                  label="Emitir A/B con CAE"
                  description="Si está apagado, A/B/X usan numeración interna."
                  checked={afipEnabled}
                  onChange={(e) => setAfipEnabled(e.currentTarget.checked)}
                />
                <Box mt="md">
                  <Text size="sm" fw={500} mb={6}>Ambiente</Text>
                  <SegmentedControl
                    fullWidth
                    value={String(afip.env ?? "HOMOLOGACION").toUpperCase()}
                    onChange={(v) => setAfip((s) => ({ ...s, env: v }))}
                    disabled={!afipEnabled}
                    data={[
                      { label: "Homologación", value: "HOMOLOGACION" },
                      { label: "Producción", value: "PRODUCCION" },
                    ]}
                  />
                </Box>
                <Box mt="md">
                  <Text size="sm" fw={500} mb={6}>Alícuota IVA</Text>
                  <SegmentedControl
                    fullWidth
                    value={normalizeIvaRate(afip.iva_percent_default)}
                    onChange={(v) => setAfip((s) => ({ ...s, iva_percent_default: v }))}
                    disabled={!afipEnabled}
                    data={IVA_RATES}
                  />
                  <Text size="xs" c="dimmed" mt={6}>
                    Se usa al desglosar neto e IVA cuando se pide el CAE.
                  </Text>
                </Box>
              </Paper>

              <div>
                <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb={8} style={{ letterSpacing: "0.06em" }}>
                  Certificados
                </Text>
                <Stack gap="sm">
                  <CertUploadRow
                    label="Certificado"
                    hint="Todavía no hay un .crt, .cer o .pem"
                    filename={arcaCertName}
                    ready={arcaCertReady}
                    pending={arcaCertFile}
                    accept=".crt,.pem,.cer"
                    uploadLabel="Subir certificado"
                    replaceLabel="Reemplazar"
                    onPick={setArcaCertFile}
                  />
                  <CertUploadRow
                    label="Clave privada"
                    hint="Todavía no hay un .key o .pem"
                    filename={arcaKeyName}
                    ready={arcaKeyReady}
                    pending={arcaKeyFile}
                    accept=".key,.pem"
                    uploadLabel="Subir clave"
                    replaceLabel="Reemplazar"
                    onPick={setArcaKeyFile}
                  />
                </Stack>
              </div>

              <Group justify="space-between" mt="xs">
                <Button variant="ghost" onClick={() => setSection(null)}>Cerrar</Button>
                <Button variant="primary" onClick={() => void confirmAndSave("fiscal")}>Guardar ARCA</Button>
              </Group>
            </Stack>
          ) : null}

          {section === "mp" ? (
            <Stack gap="lg">
              <Paper withBorder p="sm" radius="md">
                <Group gap="sm" wrap="nowrap" align="flex-start">
                  <BrandLogoMark src="/brands/mercadopago.svg" alt="Mercado Pago" size={42} />
                  <Box>
                    <Group gap={8} mb={2}>
                      <Text size="sm" fw={600}>
                        {mpTokenReady && mp.public_key.trim()
                          ? "Listo para cobrar en el portal"
                          : "Faltan credenciales"}
                      </Text>
                      <MutedBadge
                        tone={mpTokenReady && mp.public_key.trim() ? "green" : "gray"}
                        size="sm"
                      >
                        {mpTokenSource === "env" ? "Desde .env" : mpTokenReady ? "Admin" : "Sin token"}
                      </MutedBadge>
                    </Group>
                    <Text size="xs" c="dimmed">
                      El cliente paga las facturas desde el portal. El access token no se vuelve a mostrar.
                    </Text>
                  </Box>
                </Group>
              </Paper>

              <PasswordInput
                label="Access token"
                description={
                  mpTokenReady
                    ? "Ya hay un token cargado. Dejá vacío para conservarlo, o pegá uno nuevo para reemplazarlo."
                    : "TEST-… o APP_USR-… de la aplicación en Mercado Pago."
                }
                value={mp.access_token}
                onChange={(e) => setMp((s) => ({ ...s, access_token: e.currentTarget.value }))}
                placeholder={mpTokenReady ? "••••••••  (cargado)" : "TEST-… o APP_USR-…"}
              />
              <Field
                label="Public key"
                value={mp.public_key}
                onChange={(v) => setMp((s) => ({ ...s, public_key: v }))}
                placeholder="TEST-… o APP_USR-…"
              />
              <Field
                label="URL de webhook (opcional)"
                value={mp.webhook_url}
                onChange={(v) => setMp((s) => ({ ...s, webhook_url: v }))}
                placeholder="https://tu-dominio/api/webhooks/mercadopago"
              />
              <Text size="xs" c="dimmed">
                En local Mercado Pago no llega a localhost: usá un túnel (ngrok) y pegá esa URL acá.
              </Text>
              <Group justify="space-between">
                <Button variant="ghost" onClick={() => setSection(null)}>Cerrar</Button>
                <Button variant="primary" onClick={() => void confirmAndSave("mp")}>Guardar Mercado Pago</Button>
              </Group>
            </Stack>
          ) : null}

          {section === "smtp" ? (
            <Stack gap="md">
              <Grid>
                <Grid.Col span={{ base: 12, sm: 8 }}>
                  <Field
                    label="Host SMTP"
                    value={smtp.host ?? ""}
                    onChange={(v) => setSmtp((s) => ({ ...s, host: v }))}
                    placeholder="ej: smtp.gmail.com"
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 4 }}>
                  <Field
                    label="Puerto"
                    value={smtp.port ?? "587"}
                    onChange={(v) => setSmtp((s) => ({ ...s, port: v }))}
                    placeholder="587"
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6 }}>
                  <Field
                    label="Usuario"
                    value={smtp.user ?? ""}
                    onChange={(v) => setSmtp((s) => ({ ...s, user: v }))}
                    placeholder="ej: no-reply@connectisp.com"
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6 }}>
                  <PasswordInput
                    label="Contraseña"
                    value={smtp.password ?? ""}
                    onChange={(e) => setSmtp((s) => ({ ...s, password: e.currentTarget.value }))}
                    placeholder="••••••••"
                  />
                </Grid.Col>
                <Grid.Col span={12}>
                  <Field
                    label="Email remitente (From)"
                    value={smtp.from_email ?? ""}
                    onChange={(v) => setSmtp((s) => ({ ...s, from_email: v }))}
                    placeholder="vacío = mismo que el usuario"
                  />
                </Grid.Col>
                <Grid.Col span={12}>
                  <SegmentedControl
                    value={smtp.use_tls === "false" ? "false" : "true"}
                    onChange={(v) => setSmtp((s) => ({ ...s, use_tls: v }))}
                    data={[
                      { label: "TLS activado", value: "true" },
                      { label: "Sin TLS", value: "false" },
                    ]}
                  />
                </Grid.Col>
              </Grid>
              <Group justify="flex-end">
                <Button variant="default" onClick={() => setSection(null)}>Cerrar</Button>
                <Button variant="primary" onClick={() => void confirmAndSave("smtp")}>Guardar correo</Button>
              </Group>
            </Stack>
          ) : null}

          {section === "maps" ? (
            <Stack gap="md">
              <Switch
                label="Liberar automáticamente las reservas vencidas"
                description="Al vencer, el puerto se libera en el mapa (Reservados −1 / Disponibles +1) y la orden pasa a Vencida."
                checked={mapsEnabled}
                onChange={(e) => setMapsEnabled(e.currentTarget.checked)}
              />
              <Field
                label="Cron de ejecución (5 campos: min hora díaMes mes díaSemana)"
                value={mapsCron}
                onChange={setMapsCron}
                placeholder="0 * * * *"
              />
              <NumberInput
                label="Plazo de espera de la reserva (horas)"
                description="Tiempo desde la reserva hasta que se libera el puerto."
                value={mapsTtl}
                onChange={(v) =>
                  setMapsTtl(typeof v === "number" && !Number.isNaN(v) && v > 0 ? v : 168)
                }
                min={1}
                max={8760}
                disabled={!mapsEnabled}
                maw={220}
              />
              <Text size="xs" c="dimmed">
                Ejemplos: <code>0 * * * *</code> cada hora · <code>*/15 * * * *</code> cada 15 min · <code>0 6 * * *</code> todos los días a las 6:00.
              </Text>
              <Group justify="flex-end">
                <Button variant="default" onClick={() => setSection(null)}>Cerrar</Button>
                <Button variant="primary" onClick={() => void confirmAndSave("maps")}>Guardar reservas</Button>
              </Group>
            </Stack>
          ) : null}

          {section === "migration" ? (
            <Stack gap="lg">
              {migrationStatus?.safety?.mikrotik_writes_disabled ? (
                <Alert color="teal" variant="light" title="Mikrotik protegido en este entorno">
                  Las escrituras al router están bloqueadas (MIKROTIK_WRITES_DISABLED).
                  Podés migrar la base sin riesgo de cortar, restaurar ni modificar usuarios PPPoE en producción.
                </Alert>
              ) : (
                <Alert color="red" variant="light" title="Mikrotik sin bloqueo de escrituras">
                  Este entorno puede modificar el router de producción si hay credenciales API cargadas
                  o si corrés cortes/restauraciones. Activá MIKROTIK_WRITES_DISABLED=true en staging antes de importar.
                </Alert>
              )}

              {(migrationStatus?.safety?.prod_host_overlap?.length ?? 0) > 0 ? (
                <Alert color="red" variant="outline" title="Servidores apuntando a producción">
                  Los hosts {migrationStatus!.safety!.prod_host_overlap!.join(", ")} coinciden con MIKROTIK_PROD_HOSTS.
                  No cargues credenciales reales ni actives servicios automáticos hasta estar en producción.
                </Alert>
              ) : null}

              {(migrationStatus?.safety?.servers_with_real_credentials ?? 0) > 0
              && !migrationStatus?.safety?.mikrotik_writes_disabled ? (
                <Alert color="orange" variant="light" title="Credenciales Mikrotik cargadas">
                  Hay {migrationStatus!.safety!.servers_with_real_credentials} servidor(es) con usuario/clave distinto de CONFIGURAR.
                  Cualquier sync puede impactar clientes reales en el router.
                </Alert>
              ) : null}

              <Alert color="orange" variant="light" title="Operación destructiva">
                Importar reemplaza clientes, conexiones, planes y servidores Mikrotik actuales.
                No migra facturas ni pagos (Fase 1). Hacé un respaldo antes de continuar.
              </Alert>

              <Paper withBorder p="sm" radius="md">
                <input
                  ref={migrationInputRef}
                  type="file"
                  accept=".sql"
                  hidden
                  onChange={(e) => {
                    setMigrationFile(e.currentTarget.files?.[0] ?? null);
                    e.currentTarget.value = "";
                  }}
                />
                <Group justify="space-between" wrap="nowrap" align="center" gap="sm">
                  <Box style={{ minWidth: 0, flex: 1 }}>
                    <Text size="sm" fw={600}>Backup MikroWisp / Mikrowisp</Text>
                    <Text size="xs" c="dimmed" lineClamp={1} mt={2}>
                      {migrationFile?.name
                        || migrationStatus?.last_filename
                        || "Archivo .sql del sistema anterior (puede tardar varios minutos)"}
                    </Text>
                  </Box>
                  <Group gap={8} wrap="nowrap">
                    <MutedBadge tone={migrationFile ? "lilac" : migrationStatus?.last_summary ? "green" : "gray"} size="sm">
                      {migrationFile ? "Listo para subir" : migrationStatus?.last_summary ? "Analizado" : "Sin archivo"}
                    </MutedBadge>
                    <Button variant="default" onClick={() => migrationInputRef.current?.click()}>
                      Elegir archivo
                    </Button>
                    <Button
                      variant="primaryLight"
                      loading={migrationUploading}
                      disabled={!migrationFile}
                      onClick={() => void uploadMigrationBackup()}
                    >
                      Subir y analizar
                    </Button>
                    {!migrationFile && migrationStatus?.legacy_ready && !migrationStatus?.last_summary ? (
                      <Button
                        variant="default"
                        loading={migrationUploading}
                        onClick={() => void previewExistingMigration()}
                      >
                        Analizar cargado
                      </Button>
                    ) : null}
                  </Group>
                </Group>
              </Paper>

              {migrationStatus?.last_summary ? (
                <Paper withBorder p="md" radius="md">
                  <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="sm" style={{ letterSpacing: "0.06em" }}>
                    Resumen del backup
                  </Text>
                  <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
                    <Box>
                      <Text size="xs" c="dimmed">Clientes</Text>
                      <Text fw={600}>{migrationStatus.last_summary.clients}</Text>
                    </Box>
                    <Box>
                      <Text size="xs" c="dimmed">Conexiones</Text>
                      <Text fw={600}>{migrationStatus.last_summary.connections}</Text>
                    </Box>
                    <Box>
                      <Text size="xs" c="dimmed">Planes</Text>
                      <Text fw={600}>{migrationStatus.last_summary.plans}</Text>
                    </Box>
                    <Box>
                      <Text size="xs" c="dimmed">Servidores</Text>
                      <Text fw={600}>{migrationStatus.last_summary.servers}</Text>
                    </Box>
                  </SimpleGrid>
                  <Text size="xs" c="dimmed" mt="sm">
                    Usuarios en origen: {migrationStatus.last_summary.usuarios}
                    {migrationStatus.last_summary.merged_clients > 0
                      ? ` · unificados por documento: ${migrationStatus.last_summary.merged_clients}`
                      : ""}
                    {migrationStatus.last_summary.skipped_connections > 0
                      ? ` · conexiones omitidas: ${migrationStatus.last_summary.skipped_connections}`
                      : ""}
                  </Text>
                  {migrationStatus.last_at ? (
                    <Text size="xs" c="dimmed" mt={4}>Analizado: {migrationStatus.last_at}</Text>
                  ) : null}
                </Paper>
              ) : null}

              {migrationStatus?.target_clients != null ? (
                <Text size="sm" c="dimmed">
                  Connect hoy: {migrationStatus.target_clients} clientes · {migrationStatus.target_connections ?? 0} conexiones
                </Text>
              ) : null}

              <Group justify="space-between" mt="xs">
                <Button variant="ghost" onClick={() => setSection(null)}>Cerrar</Button>
                <Button
                  variant="danger"
                  loading={migrationApplying}
                  disabled={!migrationStatus?.last_summary || migrationUploading}
                  onClick={confirmApplyMigration}
                >
                  Importar a Connect
                </Button>
              </Group>
            </Stack>
          ) : null}
        </Modal>
      </Box>
    </Stack>
  );
}
