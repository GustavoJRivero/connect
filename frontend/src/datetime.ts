/**
 * Formateo de fechas y horas en la zona horaria configurada por el backend.
 *
 * El backend expone `GET /api/timezone` con `{ timezone, offset_minutes, ... }`. La cargamos
 * una vez al startup y la cacheamos en localStorage. Si la API no responde, caemos a un default
 * (America/Argentina/Buenos_Aires).
 *
 * Uso típico:
 *   import { fmtDateTime, fmtDate, fmtTime } from "../datetime";
 *   <Text>{fmtDateTime(row.created_at)}</Text>
 */
const DEFAULT_TZ = "America/Argentina/Buenos_Aires";
const STORAGE_KEY = "sc_app_tz";

let appTimezone: string = DEFAULT_TZ;

try {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  if (stored) appTimezone = stored;
} catch {
  /* ignore */
}

export function getAppTimezone(): string {
  return appTimezone || DEFAULT_TZ;
}

export function setAppTimezone(tz: string | null | undefined) {
  const next = (tz || "").trim() || DEFAULT_TZ;
  appTimezone = next;
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
}

function asDate(iso: string | Date | null | undefined): Date | null {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** Formatea fecha + hora (`02/06/2026 20:34`, opcionalmente con segundos). */
export function fmtDateTime(iso: string | Date | null | undefined, opts?: { withSeconds?: boolean }): string {
  const d = asDate(iso);
  if (!d) return "";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: getAppTimezone(),
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: opts?.withSeconds ? "2-digit" : undefined,
    hour12: false,
  }).format(d);
}

/** Formatea sólo fecha (`02/06/2026`). Acepta ISO datetime o ISO date (`YYYY-MM-DD`). */
export function fmtDate(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  // Si es un YYYY-MM-DD puro, lo respetamos textualmente para no aplicar TZ shifting.
  if (typeof iso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  }
  const d = asDate(iso);
  if (!d) return "";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: getAppTimezone(),
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/** Formatea sólo hora (`20:34`). */
export function fmtTime(iso: string | Date | null | undefined): string {
  const d = asDate(iso);
  if (!d) return "";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: getAppTimezone(),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/**
 * Llamada idempotente al startup: pega a `/api/timezone` y persiste el valor.
 * Falla silenciosamente si el backend no está disponible (queda el último valor cacheado).
 */
export async function loadAppTimezone(apiBaseUrl: string): Promise<string> {
  try {
    const res = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/api/timezone`, { credentials: "omit" });
    if (!res.ok) return getAppTimezone();
    const body = (await res.json()) as { timezone?: string };
    if (body && body.timezone) setAppTimezone(body.timezone);
    return getAppTimezone();
  } catch {
    return getAppTimezone();
  }
}
