import { API_BASE_URL } from "../api";

export type PortalApiError = { status: number; body: any };

const TOKEN_KEY = "sc_portal_token";

export function getPortalToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setPortalToken(token: string | null) {
  if (!token) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, token);
}

async function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");
  const token = getPortalToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  } catch (e: any) {
    throw { status: 0, body: { error: "network_error", message: String(e?.message ?? e) } } as PortalApiError;
  }
  if (res.status === 401) {
    setPortalToken(null);
    try {
      window.dispatchEvent(new CustomEvent("sc:portal-unauthorized"));
    } catch {
      /* ignore */
    }
  }
  const text = await res.text();
  let body: any = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) throw { status: res.status, body } as PortalApiError;
  return body;
}

export const portalApi = {
  login(identifier: string, password: string) {
    return request("/api/portal/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
    });
  },
  me() {
    return request("/api/portal/me");
  },
  changePassword(current_password: string, new_password: string) {
    return request("/api/portal/me/password", {
      method: "PUT",
      body: JSON.stringify({ current_password, new_password }),
    });
  },
  summary() {
    return request("/api/portal/summary");
  },
  invoices() {
    return request("/api/portal/invoices");
  },
  async invoicePdf(id: number) {
    const token = getPortalToken();
    const res = await fetch(`${API_BASE_URL}/api/portal/invoices/${id}/pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw { status: res.status, body: { error: "pdf_failed" } } as PortalApiError;
    return res.blob();
  },
  checkout(invoiceId: number) {
    return request(`/api/portal/invoices/${invoiceId}/checkout`, { method: "POST" });
  },
  connections() {
    return request("/api/portal/connections");
  },
  complaints() {
    return request("/api/portal/complaints");
  },
  createComplaint(payload: { connection_id: number; kind: string; detail: string }) {
    return request("/api/portal/complaints", { method: "POST", body: JSON.stringify(payload) });
  },
  notifications() {
    return request("/api/portal/notifications");
  },
  readNotification(id: number) {
    return request(`/api/portal/notifications/${id}/read`, { method: "POST" });
  },
  readAllNotifications() {
    return request("/api/portal/notifications/read-all", { method: "POST" });
  },
};
