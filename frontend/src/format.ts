/**
 * Helpers compartidos de formato y presentación:
 *  - fmtMoney: moneda ARS consistente en toda la app.
 *  - *StatusLabel: traducción de enums del backend a etiquetas en español.
 *  - formatApiError: convierte errores de la API en mensajes legibles para el operador.
 *  - todayISO / firstOfMonthISO / lastOfMonthISO: fechas "hoy" en la zona horaria de la app.
 */
import { getAppTimezone } from "./datetime";

const moneyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function fmtMoney(value: unknown): string {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(n)) return "-";
  return moneyFormatter.format(n);
}

/** Fecha actual (YYYY-MM-DD) en la zona horaria de la app — evita el corrimiento de día de toISOString() (UTC). */
export function todayISO(): string {
  // en-CA formatea como YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: getAppTimezone() }).format(new Date());
}

export function firstOfMonthISO(): string {
  return `${todayISO().slice(0, 7)}-01`;
}

export function lastOfMonthISO(): string {
  const [y, m] = todayISO().split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${String(y)}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Etiquetas de estados (enums del backend → español)
// ---------------------------------------------------------------------------

const CONNECTION_STATUS: Record<string, string> = {
  ACTIVE: "Activo",
  CUT: "Cortado",
};

export function connectionStatusLabel(status?: string | null): string {
  const s = String(status ?? "").toUpperCase();
  return CONNECTION_STATUS[s] ?? (s || "-");
}

const INVOICE_STATUS: Record<string, string> = {
  DRAFT: "Borrador",
  ISSUED: "Emitida",
  PAID: "Pagada",
  UNPAID: "Pendiente",
  OVERDUE: "Vencida",
  CANCELLED: "Anulada",
  VOID: "Anulada",
};

export function invoiceStatusLabel(status?: string | null): string {
  const s = String(status ?? "").toUpperCase();
  return INVOICE_STATUS[s] ?? (s || "-");
}

const COMPLAINT_STATUS: Record<string, string> = {
  TODO: "Pendiente",
  WIP: "En curso",
  SOLVED: "Resuelto",
};

export function complaintStatusLabel(status?: string | null): string {
  const s = String(status ?? "").toUpperCase();
  return COMPLAINT_STATUS[s] ?? (s || "-");
}

const JOB_STATUS: Record<string, string> = {
  PENDING: "Pendiente",
  RUNNING: "En ejecución",
  DONE: "Completado",
  FAILED: "Fallido",
  CANCELLED: "Cancelado",
};

export function jobStatusLabel(status?: string | null): string {
  const s = String(status ?? "").toUpperCase();
  return JOB_STATUS[s] ?? (s || "-");
}

const PAYMENT_METHOD: Record<string, string> = {
  TRANSFER: "Transferencia",
  MERCADOPAGO: "MercadoPago",
  CASH: "Efectivo",
  CARD: "Tarjeta",
};

export function paymentMethodLabel(method?: string | null): string {
  const s = String(method ?? "").toUpperCase();
  return PAYMENT_METHOD[s] ?? (s || "-");
}

// ---------------------------------------------------------------------------
// Errores de API → mensajes legibles
// ---------------------------------------------------------------------------

type ApiErrorBody = {
  error?: string;
  message?: string;
  client_id?: number;
  value?: string;
  cidr?: string;
  [key: string]: unknown;
};

const ERROR_CODE_MESSAGES: Record<string, (b: ApiErrorBody) => string> = {
  invalid_credentials: () => "Usuario o contraseña incorrectos.",
  already_bootstrapped: () => "Ya existe un administrador. Iniciá sesión con tu usuario.",
  username_and_password_required: () => "Ingresá usuario y contraseña.",
  dni_already_exists: (b) => `El DNI ya está registrado${b.client_id ? ` (cliente #${b.client_id})` : ""}.`,
  cuit_already_exists: (b) => `El CUIT ya está registrado${b.client_id ? ` (cliente #${b.client_id})` : ""}.`,
  full_name_required: () => "Ingresá el nombre o razón social.",
  full_name_too_short: () => "El nombre debe tener al menos 2 caracteres.",
  full_name_invalid: () => "El nombre debe incluir al menos una letra.",
  dni_invalid: () => "El DNI no es válido (debe tener 7 u 8 dígitos).",
  cuit_invalid: () => "El CUIT no es válido (revisá el número y el dígito verificador).",
  cuit_required: () => "Ingresá el CUIT.",
  phone_invalid: () => "El teléfono debe tener al menos 6 dígitos.",
  email_invalid: () => "El email no tiene un formato válido.",
  field_too_long: (b) => `El campo supera el máximo de ${b.max ?? ""} caracteres.`,
  invalid_data: () => "Uno de los datos supera el largo máximo permitido.",
  pool_exhausted: (b) => `No hay IPs libres en el pool${b.cidr ? ` ${b.cidr}` : ""} del servidor seleccionado.`,
  ip_already_taken: (b) => `La IP ${b.value ?? ""} ya está asignada a otra conexión de este servidor.`,
  ip_invalid: (b) => `IP inválida${b.value ? `: ${b.value}` : ""}.`,
  network_error: () => "No se pudo conectar con el servidor. Revisá la conexión.",
  not_found: () => "No se encontró el registro solicitado.",
  maps_not_configured: () => "La API de mapas no está configurada (falta MAPS_API_KEY en el backend).",
  invoice_has_payments: () => "La factura tiene pagos registrados y no se puede eliminar.",
  server_in_use: () => "El servidor tiene conexiones asociadas y no se puede eliminar.",
};

function fallbackByStatus(status: number): string {
  if (status === 0) return "No se pudo conectar con el servidor. Revisá la conexión.";
  if (status === 400) return "Los datos enviados no son válidos.";
  if (status === 401) return "La sesión expiró o las credenciales no son válidas.";
  if (status === 403) return "No tenés permisos para realizar esta acción.";
  if (status === 404) return "No se encontró el registro solicitado.";
  if (status === 409) return "La operación entra en conflicto con el estado actual de los datos.";
  if (status >= 500) return "Ocurrió un error en el servidor. Reintentá en unos segundos.";
  return "Ocurrió un error inesperado.";
}

/**
 * Convierte cualquier error lanzado por `api.ts` ({ status, body }) en un mensaje corto en español.
 * El detalle técnico completo se registra en la consola para diagnóstico.
 */
export function formatApiError(e: unknown): string {
  // eslint-disable-next-line no-console
  console.error("API error:", e);
  const err = e as { status?: number; body?: ApiErrorBody | null } | null;
  const status = Number(err?.status ?? NaN);
  const body = (err?.body ?? null) as ApiErrorBody | null;

  const code = body?.error ? String(body.error) : "";
  if (code && ERROR_CODE_MESSAGES[code]) return ERROR_CODE_MESSAGES[code](body ?? {});

  if (body?.message && typeof body.message === "string") return body.message;

  if (Number.isFinite(status)) {
    const base = fallbackByStatus(status);
    return code ? `${base} (${code})` : base;
  }
  if (e instanceof Error && e.message) return e.message;
  return "Ocurrió un error inesperado.";
}

export type ArcaMessageView = {
  title: string;
  detail: string;
  hints: string[];
  technical?: string;
};

/** Traduce respuestas crudas de WSAA/WSFE a texto operativo para Configuración → ARCA. */
export function formatArcaMessage(raw: string): ArcaMessageView {
  const msg = String(raw ?? "").trim();
  const lower = msg.toLowerCase();

  if (!msg) {
    return {
      title: "Sin respuesta",
      detail: "ARCA no devolvió detalle. Revisá certificados, CUIT y ambiente.",
      hints: ["Volvé a tocar Verificar después de guardar."],
    };
  }

  if (
    lower.includes("notauthorized") ||
    lower.includes("no autorizado") ||
    lower.includes("coe.notauthorized") ||
    lower.includes("computador no autorizado")
  ) {
    return {
      title: "Certificado no autorizado",
      detail:
        "ARCA rechazó el certificado: no tiene permiso para acceder a los servicios de facturación electrónica (WSAA/WSFE).",
      hints: [
        "En el portal de ARCA, autorizá el certificado para los servicios WSAA y WSFE (Administrador de certificados / relaciones).",
        "Confirmá que el CUIT del certificado sea el mismo que el CUIT emisor configurado acá.",
        "Usá certificados de Homologación si el ambiente es Homologación, y de Producción si es Producción.",
      ],
      technical: msg,
    };
  }

  if (lower.includes("alreadyauthenticated") || lower.includes("ya autenticado")) {
    return {
      title: "Sesión WSAA activa",
      detail: "Ya hay un ticket WSAA vigente. No es un error grave; probá de nuevo en unos minutos.",
      hints: ["Esperá 2–5 minutos y volvé a verificar."],
      technical: msg,
    };
  }

  if (lower.includes("cert") && (lower.includes("invalid") || lower.includes("expir") || lower.includes("venc"))) {
    return {
      title: "Certificado inválido o vencido",
      detail: "El certificado o la clave no son válidos, están vencidos o no corresponden entre sí.",
      hints: [
        "Generá un certificado nuevo en ARCA y subilo de nuevo acá.",
        "Verificá que la clave privada sea la pareja del certificado cargado.",
      ],
      technical: msg,
    };
  }

  if (lower.includes("cuit") || lower.includes("nro documento")) {
    return {
      title: "CUIT incorrecto",
      detail: "El CUIT configurado no coincide con el del certificado o no es válido para ARCA.",
      hints: ["Revisá el CUIT emisor en Datos fiscales.", "Debe ser el mismo CUIT con el que generaste el certificado."],
      technical: msg,
    };
  }

  if (lower.includes("faltan") && lower.includes("certificado")) {
    return {
      title: "Faltan certificados",
      detail: "Subí el certificado y la clave privada antes de verificar.",
      hints: ["Usá Subir certificado y Subir clave, guardá, y volvé a verificar."],
    };
  }

  const human = msg
    .replace(/^wsaa_fault:/i, "")
    .replace(/^wsfe_fault:/i, "")
    .replace(/^afipintegrationerror:/i, "")
    .replace(/ns1:/gi, "")
    .replace(/coe\./gi, "")
    .trim();

  const dashPart = human.split(/[—–-]/).map((s) => s.trim()).filter(Boolean);
  const detail = dashPart.length > 1 ? dashPart[dashPart.length - 1] : human;

  return {
    title: "No se pudo conectar con ARCA",
    detail: detail || "Revisá certificados, CUIT y ambiente.",
    hints: [
      "Confirmá ambiente (Homologación / Producción) y que los archivos sean los correctos.",
      "Si el problema persiste, copiá el detalle técnico y consultalo con soporte o ARCA.",
    ],
    technical: msg !== detail ? msg : msg.length > 80 ? msg : undefined,
  };
}
