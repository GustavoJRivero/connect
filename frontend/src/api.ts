export const API_BASE_URL =
  (process.env.REACT_APP_API_BASE_URL as string | undefined) ?? "http://localhost:5001";

export type ApiError = { status: number; body: any };

let _pendingRequests = 0;

function emitLoading() {
  try {
    window.dispatchEvent(new CustomEvent("sc:loading", { detail: { pending: _pendingRequests } }));
  } catch {
    // ignore
  }
}

function loadingStart() {
  _pendingRequests += 1;
  emitLoading();
}

function loadingEnd() {
  _pendingRequests = Math.max(0, _pendingRequests - 1);
  emitLoading();
}

function getToken(): string | null {
  return localStorage.getItem("sc_token");
}

export function setToken(token: string | null) {
  if (!token) localStorage.removeItem("sc_token");
  else localStorage.setItem("sc_token", token);
}

async function request(path: string, init: RequestInit = {}) {
  loadingStart();
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json");

  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  try {
    let res: Response;
    try {
      res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
    } catch (e: any) {
      const err: ApiError = { status: 0, body: { error: "network_error", message: String(e?.message ?? e) } };
      throw err;
    }

    const text = await res.text();
    const body = text ? safeJson(text) : null;

    if (!res.ok) {
      // Sesión expirada / token inválido: limpiar y notificar al resto de la app
      if (res.status === 401) {
        setToken(null);
        try {
          window.dispatchEvent(new CustomEvent("sc:unauthorized", { detail: { path } }));
        } catch {
          // ignore
        }
      }
      const err: ApiError = { status: res.status, body };
      throw err;
    }
    return body;
  } finally {
    loadingEnd();
  }
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const api = {
  // dashboard
  getDashboardSummary() {
    return request("/api/dashboard/summary");
  },

  // auth
  bootstrap(username: string, password: string) {
    return request("/api/auth/bootstrap", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },
  async login(username: string, password: string): Promise<{ access_token: string }> {
    return request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },
  me() {
    return request("/api/auth/me");
  },

  // clients
  listClients(opts?: {
    q?: string;
    limit?: number;
    offset?: number;
    sort_by?: string;
    sort_dir?: "asc" | "desc";
  }) {
    if (!opts) return request("/api/clients");
    const params = new URLSearchParams();
    if (opts.q) params.set("q", opts.q);
    if (typeof opts.limit === "number") params.set("limit", String(opts.limit));
    if (typeof opts.offset === "number") params.set("offset", String(opts.offset));
    if (opts.sort_by) params.set("sort_by", opts.sort_by);
    if (opts.sort_dir) params.set("sort_dir", opts.sort_dir);
    const qs = params.toString();
    return request(`/api/clients${qs ? `?${qs}` : ""}`);
  },
  getClient(id: number) {
    return request(`/api/clients/${id}`);
  },
  suspendClientServices(id: number, cut_profile?: string) {
    return request(`/api/clients/${id}/suspend_services`, {
      method: "POST",
      body: JSON.stringify({ cut_profile }),
    });
  },
  createClient(payload: any) {
    return request("/api/clients", { method: "POST", body: JSON.stringify(payload) });
  },
  updateClient(id: number, payload: any) {
    return request(`/api/clients/${id}`, { method: "PUT", body: JSON.stringify(payload) });
  },
  deleteClient(id: number) {
    return request(`/api/clients/${id}`, { method: "DELETE" });
  },

  // connections
  createConnection(payload: any) {
    return request("/api/connections", { method: "POST", body: JSON.stringify(payload) });
  },
  updateConnection(id: number, payload: any) {
    return request(`/api/connections/${id}`, { method: "PUT", body: JSON.stringify(payload) });
  },
  getConnectionMtStatus(id: number) {
    return request(`/api/connections/${id}/mt_status`);
  },
  cutConnection(id: number, cut_profile?: string) {
    return request(`/api/connections/${id}/cut`, {
      method: "POST",
      body: JSON.stringify({ cut_profile }),
    });
  },
  restoreConnection(id: number) {
    return request(`/api/connections/${id}/restore`, { method: "POST", body: JSON.stringify({}) });
  },
  deleteConnection(id: number) {
    return request(`/api/connections/${id}`, { method: "DELETE" });
  },

  // invoices
  listInvoices(client_id?: number) {
    const qs = client_id ? `?client_id=${client_id}` : "";
    return request(`/api/invoices${qs}`);
  },
  createInvoice(payload: any) {
    return request("/api/invoices", { method: "POST", body: JSON.stringify(payload) });
  },
  issueInvoice(id: number) {
    return request(`/api/invoices/${id}/issue`, { method: "POST", body: JSON.stringify({}) });
  },
  deleteInvoice(id: number) {
    return request(`/api/invoices/${id}`, { method: "DELETE" });
  },

  // payments
  listPayments(
    client_id?: number,
    opts?: { from?: string; to?: string; day?: string; month?: string; year?: string }
  ) {
    const params = new URLSearchParams();
    if (client_id) params.set("client_id", String(client_id));
    if (opts?.from) params.set("from", opts.from);
    if (opts?.to) params.set("to", opts.to);
    if (opts?.day) params.set("day", opts.day);
    if (opts?.month) params.set("month", opts.month);
    if (opts?.year) params.set("year", opts.year);
    const qs = params.toString();
    return request(`/api/payments${qs ? `?${qs}` : ""}`);
  },
  createPayment(payload: any) {
    return request("/api/payments", { method: "POST", body: JSON.stringify(payload) });
  },

  // settings
  getIssuer() {
    return request("/api/settings/issuer");
  },
  putIssuer(payload: any) {
    return request("/api/settings/issuer", { method: "PUT", body: JSON.stringify(payload) });
  },
  getSettings(prefix?: string) {
    const qs = prefix ? `?prefix=${encodeURIComponent(prefix)}` : "";
    return request(`/api/settings/kv${qs}`);
  },
  putSettings(values: Record<string, string>) {
    return request("/api/settings/kv", { method: "PUT", body: JSON.stringify({ values }) });
  },

  // billing
  generateBilling(payload: any) {
    return request("/api/billing/generate", { method: "POST", body: JSON.stringify(payload) });
  },
  updateServices(payload?: any) {
    return request("/api/billing/update-services", { method: "POST", body: JSON.stringify(payload || {}) });
  },

  // complaints
  listComplaints(client_id?: number) {
    const qs = client_id ? `?client_id=${client_id}` : "";
    return request(`/api/complaints${qs}`);
  },
  createComplaint(payload: any) {
    return request("/api/complaints", { method: "POST", body: JSON.stringify(payload) });
  },
  updateComplaint(id: number, payload: any) {
    return request(`/api/complaints/${id}`, { method: "PUT", body: JSON.stringify(payload) });
  },

  // network (pppoe servers)
  listServers() {
    return request("/api/network/servers");
  },
  getServer(id: number) {
    return request(`/api/network/servers/${id}`);
  },
  createServer(payload: any) {
    return request("/api/network/servers", { method: "POST", body: JSON.stringify(payload) });
  },
  updateServer(id: number, payload: any) {
    return request(`/api/network/servers/${id}`, { method: "PUT", body: JSON.stringify(payload) });
  },
  deleteServer(id: number) {
    return request(`/api/network/servers/${id}`, { method: "DELETE" });
  },
  testServerConnection(serverId: number, overrides?: { host?: string; port?: number; username?: string; password?: string; use_ssl?: boolean }) {
    return request(`/api/network/servers/${serverId}/test`, {
      method: "POST",
      body: JSON.stringify(overrides || {}),
    });
  },
  testConnectionInline(payload: { host: string; port: number; username: string; password: string; use_ssl?: boolean }) {
    return request("/api/network/servers/test", { method: "POST", body: JSON.stringify(payload) });
  },
  listServerJobs(server_id: number) {
    return request(`/api/network/servers/${server_id}/jobs`);
  },
  retryJob(job_id: number) {
    return request(`/api/jobs/${job_id}/retry`, { method: "POST", body: JSON.stringify({}) });
  },
  cancelJob(job_id: number) {
    return request(`/api/jobs/${job_id}/cancel`, { method: "POST", body: JSON.stringify({}) });
  },
  recoverStuckJobs(server_id?: number) {
    const q = server_id != null ? `?server_id=${server_id}` : "";
    return request(`/api/jobs/recover-stuck${q}`, { method: "POST", body: JSON.stringify({}) });
  },
  listJobs(params?: { status?: string; job_type?: string; limit?: number; offset?: number }) {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.job_type) qs.set("job_type", params.job_type);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const q = qs.toString();
    return request(`/api/jobs${q ? `?${q}` : ""}`);
  },
  getJobTypes() {
    return request("/api/jobs/types");
  },

  // plans
  listPlans(activeOnly = false) {
    const qs = activeOnly ? "?active_only=1" : "";
    return request(`/api/plans${qs}`);
  },
  createPlan(payload: any) {
    return request("/api/plans", { method: "POST", body: JSON.stringify(payload) });
  },
  updatePlan(id: number, payload: any) {
    return request(`/api/plans/${id}`, { method: "PUT", body: JSON.stringify(payload) });
  },
  deletePlan(id: number) {
    return request(`/api/plans/${id}`, { method: "DELETE" });
  },
  getAfipStatus() {
    return request("/api/invoices/afip/status");
  },

  // logs
  getLogs(opts?: {
    module?: string;
    level?: string;
    q?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }) {
    const params = new URLSearchParams();
    if (opts?.module) params.set("module", opts.module);
    if (opts?.level) params.set("level", opts.level);
    if (opts?.q) params.set("q", opts.q);
    if (opts?.from) params.set("from", opts.from);
    if (opts?.to) params.set("to", opts.to);
    if (typeof opts?.limit === "number") params.set("limit", String(opts.limit));
    if (typeof opts?.offset === "number") params.set("offset", String(opts.offset));
    const qs = params.toString();
    return request(`/api/logs${qs ? `?${qs}` : ""}`)
  },
  getLogModules() {
    return request("/api/logs/modules");
  },
  getLoggingConfig() {
    return request("/api/logs/config");
  },
  updateLoggingConfig(payload: { enabled?: boolean; modules?: Record<string, boolean> }) {
    return request("/api/logs/config", { method: "PUT", body: JSON.stringify(payload) });
  },

  // invoice PDF & email
  getInvoicePdfUrl(id: number) {
    const token = getToken();
    return `${API_BASE_URL}/api/invoices/${id}/pdf${token ? `?jwt=${token}` : ""}`;
  },
  sendInvoiceEmail(id: number, to?: string) {
    return request(`/api/invoices/${id}/send_email`, {
      method: "POST",
      body: JSON.stringify(to ? { to } : {}),
    });
  },

  // billing status
  getBillingStatus() {
    return request("/api/billing/status")
  },
};

