import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { Button, Card, Field } from "../ui";
import { InvoiceModal } from "../components/InvoiceModal";
import { ComplaintModal } from "../components/ComplaintModal";
import { PaymentModal } from "../components/PaymentModal";
import { ConnectionDetailsModal } from "../components/ConnectionDetailsModal";
import { ClientEditModal } from "../components/ClientEditModal";
import { ConnectionCreateModal } from "../components/ConnectionCreateModal";
import { ConnectionEditModal } from "../components/ConnectionEditModal";

type Client = any;

export default function ClientsPage() {
  const params = useParams();
  const navigate = useNavigate();
  const loc = useLocation();

  const [mode, setMode] = useState<"list" | "create" | "detail">("list");
  const [items, setItems] = useState<Client[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [clientId, setClientId] = useState<number | null>(null);

  const [pageSize, setPageSize] = useState<number>(10);
  const [page, setPage] = useState<number>(1);
  const [total, setTotal] = useState<number>(0);
  const [sortBy, setSortBy] = useState<
    "id" | "full_name" | "address" | "phone" | "email" | "debt_total" | "services_status" | "connections_count"
  >("id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [editingClientId, setEditingClientId] = useState<number | null>(null);

  const [kind, setKind] = useState<"PERSON" | "COMPANY">("PERSON");
  const [fullName, setFullName] = useState("");
  const [dni, setDni] = useState("");
  const [cuit, setCuit] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");

  const [planProfile, setPlanProfile] = useState("50M");
  const [serviceAddress, setServiceAddress] = useState("");
  const [location, setLocation] = useState("");
  const [serverId, setServerId] = useState<string>("");
  const [ip, setIp] = useState<string>("");
  const [servers, setServers] = useState<any[]>([]);

  const [planOptions, setPlanOptions] = useState<string[]>(["25M", "50M", "100M", "300M"]);

  const desiredMode = useMemo<"list" | "create" | "detail">(() => {
    if (params.clientId) return "detail";
    if (loc.pathname.endsWith("/new")) return "create";
    return "list";
  }, [loc.pathname, params.clientId]);

  useEffect(() => {
    setError(null);
    if (desiredMode === "detail") {
      const id = Number(params.clientId);
      setClientId(Number.isFinite(id) ? id : null);
      setMode("detail");
      return;
    }
    if (desiredMode === "create") {
      setClientId(null);
      setMode("create");
      return;
    }
    setClientId(null);
    setMode("list");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desiredMode, params.clientId]);

  async function reloadList() {
    setError(null);
    try {
      const offset = Math.max(0, (page - 1) * pageSize);
      const res: any = await api.listClients({
        q: q || "",
        limit: pageSize,
        offset,
        sort_by: sortBy,
        sort_dir: sortDir,
      });
      const list = Array.isArray(res) ? res : res?.items ?? [];
      setItems(list);
      setTotal(Number(Array.isArray(res) ? list.length : res?.total ?? 0));
    } catch (e: any) {
      setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`);
    }
  }

  useEffect(() => {
    api
      .getSettings("plan.price.")
      .then((kv: any) => {
        const keys = Object.keys(kv || {})
          .filter((k) => k.startsWith("plan.price."))
          .map((k) => k.replace("plan.price.", ""));
        const unique = Array.from(new Set(keys)).sort();
        if (unique.length) setPlanOptions(unique);
      })
      .catch(() => {});

    api
      .listServers()
      .then((xs: any) => setServers(xs || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Para list, usamos server-side paging/sort con debounce
    if (desiredMode !== "list") return;
    const t = setTimeout(() => {
      reloadList();
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desiredMode, q, page, pageSize, sortBy, sortDir]);

  async function create() {
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        kind,
        full_name: fullName,
        dni: kind === "PERSON" ? dni || null : null,
        cuit: kind === "COMPANY" ? cuit || null : null,
        phone: phone || null,
        email: email || null,
        address: address || null,
        connections: [
          {
            server_id: serverId ? Number(serverId) : null,
            ip: ip || null,
            plan_profile: planProfile,
            service_address: serviceAddress || null,
            location: location || null,
          },
        ],
        provision_mikrotik: true,
      };
      const res = await api.createClient(payload);
      const created = res?.client ?? res;
      const newId = Number(created?.id);
      if (!newId || Number.isNaN(newId)) {
        setSuccess("Cliente creado.");
        navigate("/clients");
        return;
      }
      setFullName("");
      setDni("");
      setCuit("");
      setPhone("");
      setEmail("");
      setAddress("");
      setServiceAddress("");
      setLocation("");
      setServerId("");
      setIp("");
      setSuccess(`Cliente #${newId} creado correctamente.`);
      setClientId(newId);
      navigate(`/clients/${newId}`);
    } catch (e: any) {
      const body = e?.body ?? e;
      if (e?.status === 409 && body?.error === "dni_already_exists") {
        setError(`DNI ya existe (cliente #${body?.client_id}).`);
        return;
      }
      if (e?.status === 409 && body?.error === "cuit_already_exists") {
        setError(`CUIT ya existe (cliente #${body?.client_id}).`);
        return;
      }
      setError(`${e?.status ?? ""} ${JSON.stringify(body)}`);
    }
  }

  async function cutRestore(conn: any) {
    setError(null);
    try {
      if (conn.status === "CUT") await api.restoreConnection(conn.id);
      else await api.cutConnection(conn.id, "suspended");
      await reloadList();
    } catch (e: any) {
      setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`);
    }
  }

  function openClient(id: number) {
    setError(null);
    setSuccess(null);
    navigate(`/clients/${id}`);
  }

  function toggleSort(col: typeof sortBy) {
    if (sortBy === col) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortBy(col);
      setSortDir("asc");
    }
    setPage(1);
  }

  function sortIcon(col: typeof sortBy) {
    if (sortBy !== col) return <i className="fa-solid fa-sort ms-2 text-muted" />;
    return sortDir === "asc" ? (
      <i className="fa-solid fa-sort-up ms-2" />
    ) : (
      <i className="fa-solid fa-sort-down ms-2" />
    );
  }

  function servicesBadge(c: any) {
    const clientStatus = String(c?.status ?? "ACTIVE");
    const s = String(c?.services_status ?? "");
    if (clientStatus === "RETIRED") return <span className="badge text-bg-dark">Retirado</span>;
    if (s === "SUSPENDED") return <span className="badge text-bg-danger">Suspendido</span>;
    if (s === "ACTIVE") return <span className="badge text-bg-success">Activo</span>;
    return <span className="badge text-bg-secondary">{s || "-"}</span>;
  }

  const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));
  const start = total ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(total, (page - 1) * pageSize + items.length);

  return (
    <div>
      <ClientEditModal
        open={editingClientId != null}
        clientId={editingClientId}
        onClose={() => setEditingClientId(null)}
        onSaved={async () => {
          setEditingClientId(null);
          await reloadList();
        }}
      />
      {mode === "detail" && clientId ? (
        <>
          {success ? (
            <div className="alert alert-success d-flex align-items-center justify-content-between">
              <div>{success}</div>
              <button type="button" className="btn-close" aria-label="Close" onClick={() => setSuccess(null)} />
            </div>
          ) : null}
        </>
      ) : null}

      {mode === "detail" && clientId ? (
        <ClientDetail
          clientId={clientId}
          onBack={() => {
            setSuccess(null);
            navigate("/clients");
          }}
          onEdit={() => setEditingClientId(clientId)}
          servers={servers}
          planOptions={planOptions}
        />
      ) : null}

      {mode === "create" ? (
        <Card title="Crear nuevo cliente">
          <div className="row">
            <div className="col-lg-6">
              <Card title="Datos del cliente">
                <div className="btn-group mb-3" role="group">
                  <Button
                    variant={kind === "PERSON" ? "primary" : "default"}
                    onClick={() => {
                      setKind("PERSON");
                      setCuit("");
                    }}
                  >
                    Persona
                  </Button>
                  <Button
                    variant={kind === "COMPANY" ? "primary" : "default"}
                    onClick={() => {
                      setKind("COMPANY");
                      setDni("");
                    }}
                  >
                    Empresa
                  </Button>
                </div>

                <Field label="Nombre / Razón social" value={fullName} onChange={setFullName} />
                <div className="row">
                  {kind === "PERSON" ? (
                    <div className="col-md-6">
                      <Field label="DNI" value={dni} onChange={setDni} />
                    </div>
                  ) : (
                    <div className="col-md-6">
                      <Field label="CUIT" value={cuit} onChange={setCuit} />
                    </div>
                  )}
                </div>
                <div className="row">
                  <div className="col-md-6">
                    <Field label="Tel/Cel" value={phone} onChange={setPhone} />
                  </div>
                  <div className="col-md-6">
                    <Field label="Email" value={email} onChange={setEmail} />
                  </div>
                </div>
                <Field label="Dirección (facturación / principal)" value={address} onChange={setAddress} />
              </Card>
            </div>

            <div className="col-lg-6">
              <Card title="Datos de la conexión (servicio)">
                <div className="mb-3">
                  <label className="form-label">Servidor PPPoE (Mikrotik)</label>
                  <select className="form-select" value={serverId} onChange={(e) => setServerId(e.target.value)}>
                    <option value="">(Seleccionar servidor)</option>
                    {servers.map((s) => (
                      <option key={s.id} value={String(s.id)}>
                        #{s.id} — {s.name} ({s.host}:{s.port})
                      </option>
                    ))}
                  </select>
                  {!servers.length ? (
                    <div className="form-text">
                      No hay servidores cargados. Crealos en <b>Red</b>.
                    </div>
                  ) : null}
                </div>
                <div className="mb-3">
                  <label className="form-label">Plan</label>
                  <select className="form-select" value={planProfile} onChange={(e) => setPlanProfile(e.target.value)}>
                    {planOptions.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <Field label="Domicilio del servicio" value={serviceAddress} onChange={setServiceAddress} />
                <Field label="Ubicación (referencia / GPS / barrio)" value={location} onChange={setLocation} />
                <Field label="IP (opcional)" value={ip} onChange={setIp} placeholder="ej: 192.168.1.50" />
              </Card>
            </div>
          </div>

          <div className="mt-2">
            <Button variant="primary" onClick={create}>
              Guardar
            </Button>
            <Button
              variant="default"
              onClick={() => {
                setError(null);
                setSuccess(null);
                navigate("/clients");
              }}
            >
              Cancelar
            </Button>
          </div>

          {error ? <div className="alert alert-danger sc-error mt-3">{error}</div> : null}
        </Card>
      ) : mode === "list" ? (
        <Card
          className="card card-outline card-primary"
          title="Clientes"
          footer={
            <div className="row align-items-center">
              <div className="col-sm-12 col-md-5">
                <div className="dataTables_info">
                  Mostrando <b>{start}</b>-<b>{end}</b> de <b>{total}</b>
                </div>
              </div>
              <div className="col-sm-12 col-md-7">
                <div className="dataTables_paginate paging_simple_numbers">
                  <ul className="pagination pagination-sm m-0 justify-content-end">
                    <li className={`page-item ${page <= 1 ? "disabled" : ""}`}>
                      <button className="page-link" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                        Anterior
                      </button>
                    </li>
                    <li className="page-item disabled">
                      <span className="page-link">
                        {page} / {totalPages}
                      </span>
                    </li>
                    <li className={`page-item ${page >= totalPages ? "disabled" : ""}`}>
                      <button
                        className="page-link"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                      >
                        Siguiente
                      </button>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          }
        >
          <div className="row g-2 align-items-end mb-3">
            <div className="col-md-6" style={{ minWidth: 260 }}>
              <label className="form-label">Buscar</label>
              <input
                className="form-control form-control-sm"
                value={q}
                placeholder="nombre, dni/cuit, tel, email, id..."
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="col-md-2" style={{ minWidth: 160 }}>
              <label className="form-label">Por página</label>
              <select
                className="form-select form-select-sm"
                value={String(pageSize)}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                <option value="10">10</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
            <div className="col-md-4 d-flex justify-content-md-end gap-2">
              <Button variant="primary" onClick={() => navigate("/clients/new")}>
                Crear nuevo cliente
              </Button>
              <Button variant="default" onClick={reloadList}>
                Recargar
              </Button>
            </div>
          </div>

          {error ? <div className="alert alert-danger sc-error">{error}</div> : null}

          <div className="row">
            <div className="col-12">
              <div className="table-responsive">
                <table className="table table-bordered table-hover table-sm">
                  <thead>
                    <tr>
                      <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("id")}>
                        ID {sortIcon("id")}
                      </th>
                      <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("full_name")}>
                        Nombre {sortIcon("full_name")}
                      </th>
                      <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("address")}>
                        Dirección {sortIcon("address")}
                      </th>
                      <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("phone")}>
                        Telefono {sortIcon("phone")}
                      </th>
                      <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("email")}>
                        Email {sortIcon("email")}
                      </th>
                      <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("debt_total")}>
                        Deuda {sortIcon("debt_total")}
                      </th>
                      <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("services_status")}>
                        Estado {sortIcon("services_status")}
                      </th>
                      <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("connections_count")}>
                        Conexiones {sortIcon("connections_count")}
                      </th>
                      <th style={{ width: 130 }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((c) => (
                      <tr
                        key={c.id}
                        style={{ cursor: "pointer" }}
                        title="Abrir cliente"
                        onClick={() => openClient(c.id)}
                      >
                        <td>#{c.id}</td>
                        <td>
                          <span
                            className={`badge me-2 ${c.kind === "COMPANY" ? "text-bg-primary" : "text-bg-info"}`}
                            title={c.kind === "COMPANY" ? "Empresa" : "Persona"}
                          >
                            <i className={`fa-solid ${c.kind === "COMPANY" ? "fa-building" : "fa-user"}`} />
                          </span>
                          {c.full_name}
                        </td>
                        <td>{c.address ?? "-"}</td>
                        <td>{c.phone ?? "-"}</td>
                        <td>{c.email ?? "-"}</td>
                        <td>
                          <span className={`badge ${Number(c.debt_total ?? "0") > 0 ? "text-bg-danger" : "text-bg-success"}`}>
                            AR$ {c.debt_total ?? "0"}
                          </span>
                        </td>
                        <td>{servicesBadge(c)}</td>
                        <td>{c.connections_count ?? 0}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary me-2"
                            title="Editar"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingClientId(Number(c.id));
                            }}
                          >
                            <i className="fa-solid fa-pen-to-square" />
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            title="Eliminar"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!window.confirm("¿Eliminar cliente y conexiones?")) return;
                              await api.deleteClient(c.id);
                              // si borrás el último item de una página, retrocede una página
                              if (items.length === 1 && page > 1) setPage(page - 1);
                              else await reloadList();
                            }}
                          >
                            <i className="fa-solid fa-trash" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function statusBadge(paymentStatus: string) {
  if (paymentStatus === "PAID") return <span className="badge bg-success">Pagada</span>;
  if (paymentStatus === "OVERDUE") return <span className="badge bg-danger">Vencida</span>;
  if (paymentStatus === "UNPAID") return <span className="badge bg-warning text-dark">Impaga</span>;
  if (paymentStatus === "DRAFT") return <span className="badge bg-secondary">Draft</span>;
  return <span className="badge bg-secondary">{paymentStatus}</span>;
}

function ClientDetail(props: {
  clientId: number;
  onBack: () => void;
  onEdit: () => void;
  servers: any[];
  planOptions: string[];
}) {
  const [client, setClient] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [complaints, setComplaints] = useState<any[]>([]);
  const [tab, setTab] = useState<"connections" | "billing" | "complaints">("connections");
  const [error, setError] = useState<string | null>(null);
  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [showNewComplaint, setShowNewComplaint] = useState(false);
  const [showNewConnection, setShowNewConnection] = useState(false);

  const [paying, setPaying] = useState<any | null>(null);
  const [connDetails, setConnDetails] = useState<any | null>(null);
  const [editingConn, setEditingConn] = useState<any | null>(null);

  async function reloadDetail() {
    setError(null);
    try {
      const c = await api.getClient(props.clientId);
      setClient(c);
    } catch (e: any) {
      setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`);
    }

    try {
      const inv = await api.listInvoices(props.clientId);
      setInvoices(inv);
    } catch (e: any) {
      setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`);
    }

    try {
      const items = await api.listComplaints(props.clientId);
      setComplaints(items);
    } catch (e: any) {
      setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`);
    }
  }

  useEffect(() => {
    reloadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.clientId]);

  async function cutRestore(conn: any) {
    setError(null);
    try {
      if (conn.status === "CUT") await api.restoreConnection(conn.id);
      else await api.cutConnection(conn.id, "suspended");
      await reloadDetail();
    } catch (e: any) {
      setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`);
    }
  }

  function openPay(x: any) {
    setError(null);
    setPaying(x);
  }

  async function deleteInvoice(id: number) {
    setError(null);
    try {
      if (!window.confirm("¿Eliminar factura? (baja lógica, solo si no tiene pagos)")) return;
      await api.deleteInvoice(id);
      setPaying(null);
      await reloadDetail();
    } catch (e: any) {
      setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`);
    }
  }

  async function suspendAllServices() {
    setError(null);
    try {
      if (!window.confirm("¿Suspender TODOS los servicios del cliente? (Se aplicará suspended)")) return;
      await api.suspendClientServices(props.clientId, "suspended");
      await reloadDetail();
    } catch (e: any) {
      setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`);
    }
  }

  return (
    <div>
      <InvoiceModal
        open={showNewInvoice}
        client={client}
        connections={client?.connections ?? []}
        onClose={() => setShowNewInvoice(false)}
        onSaved={async () => {
          setShowNewInvoice(false);
          await reloadDetail();
        }}
      />

      <ComplaintModal
        open={showNewComplaint}
        client={client}
        connections={client?.connections ?? []}
        onClose={() => setShowNewComplaint(false)}
        onSaved={async () => {
          setShowNewComplaint(false);
          await reloadDetail();
        }}
      />

      <PaymentModal
        open={!!paying}
        invoice={paying}
        onClose={() => setPaying(null)}
        onSaved={async () => {
          setPaying(null);
          await reloadDetail();
        }}
      />

      <ConnectionDetailsModal
        open={!!connDetails}
        connection={connDetails}
        onClose={() => setConnDetails(null)}
        onSaved={async () => {
          setConnDetails(null);
          await reloadDetail();
        }}
      />

      <ConnectionCreateModal
        open={showNewConnection}
        clientId={props.clientId}
        servers={props.servers || []}
        planOptions={props.planOptions || []}
        onClose={() => setShowNewConnection(false)}
        onSaved={async () => {
          setShowNewConnection(false);
          await reloadDetail();
        }}
      />

      <ConnectionEditModal
        open={!!editingConn}
        connection={editingConn}
        servers={props.servers || []}
        planOptions={props.planOptions || []}
        onClose={() => setEditingConn(null)}
        onSaved={async () => {
          setEditingConn(null);
          await reloadDetail();
        }}
      />

      <Card
        className="card card-outline card-primary"
        title={`Cliente #${props.clientId}`}
        headerRight={
          <>
            <button type="button" className="btn btn-sm btn-outline-secondary me-2" title="Volver" onClick={props.onBack}>
              <i className="fa-solid fa-arrow-left" />
            </button>
            <button type="button" className="btn btn-sm btn-outline-primary me-2" title="Editar" onClick={props.onEdit}>
              <i className="fa-solid fa-pen-to-square" />
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-warning me-2"
              title="Suspender servicios (suspended)"
              onClick={suspendAllServices}
            >
              <i className="fa-solid fa-ban" />
            </button>
            <button type="button" className="btn btn-sm btn-outline-secondary" title="Recargar" onClick={reloadDetail}>
              <i className="fa-solid fa-rotate" />
            </button>
          </>
        }
      >
        {error ? <div className="alert alert-danger sc-error">{error}</div> : null}
        {client ? (
          <div className="row">
            <div className="col-lg-6">
              <div className="mb-2">
                <strong>{client.full_name}</strong> <span className="badge bg-secondary ms-2">{client.kind}</span>
              </div>
              <div className="text-muted">
                {client.kind === "PERSON" ? `DNI: ${client.dni ?? "-"}` : `CUIT: ${client.cuit ?? "-"}`}
              </div>
              <div className="text-muted">Tel/Cel: {client.phone ?? "-"}</div>
              <div className="text-muted">Email: {client.email ?? "-"}</div>
            </div>
            <div className="col-lg-6">
              <div className="text-muted">Dirección: {client.address ?? "-"}</div>
              <div className="text-muted">Activo: {client.is_active ? "Sí" : "No"}</div>
              <div className="text-muted">Conexiones: {client.connections?.length ?? 0}</div>
              <div className="text-muted">Facturas: {invoices.length}</div>
            </div>
          </div>
        ) : (
          <div className="text-muted">Cargando...</div>
        )}
      </Card>

      <div className="card card-outline card-secondary">
        <div className="card-header">
          <ul className="nav nav-tabs card-header-tabs">
            <li className="nav-item">
              <a
                href="#"
                className={`nav-link ${tab === "connections" ? "active" : ""}`}
                onClick={(e) => {
                  e.preventDefault();
                  setTab("connections");
                }}
              >
                Conexiones
              </a>
            </li>
            <li className="nav-item">
              <a
                href="#"
                className={`nav-link ${tab === "billing" ? "active" : ""}`}
                onClick={(e) => {
                  e.preventDefault();
                  setTab("billing");
                }}
              >
                Facturación
              </a>
            </li>
            <li className="nav-item">
              <a
                href="#"
                className={`nav-link ${tab === "complaints" ? "active" : ""}`}
                onClick={(e) => {
                  e.preventDefault();
                  setTab("complaints");
                }}
              >
                Reclamos
              </a>
            </li>
          </ul>
        </div>
        <div className="card-body">
          {tab === "connections" ? (
            <div>
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
                <div className="text-muted">Conexiones del cliente</div>
                <div className="d-flex gap-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    title="Nueva conexión"
                    onClick={() => setShowNewConnection(true)}
                  >
                    <i className="fa-solid fa-plus me-2" />
                    Nueva conexión
                  </button>
                </div>
              </div>

              <div className="table-responsive">
                <table className="table table-bordered table-hover table-sm">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>PPPoE</th>
                    <th>Server</th>
                    <th>IP</th>
                    <th>Plan</th>
                    <th>Domicilio</th>
                    <th>Estado</th>
                    <th style={{ width: 140 }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {(client?.connections ?? []).map((conn: any) => (
                    <tr key={conn.id}>
                      <td>#{conn.id}</td>
                      <td>{conn.pppoe_name}</td>
                      <td>{conn.server_name ?? "-"}</td>
                      <td>
                        {conn.ip ? (
                          <a href={`http://${conn.ip.trim()}`} target="_blank" rel="noopener noreferrer" className="text-primary">
                            {conn.ip}
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>{conn.plan_profile}</td>
                      <td>{conn.service_address ?? "-"}</td>
                      <td>
                        <span className={`badge ${conn.status === "CUT" ? "text-bg-danger" : "text-bg-success"}`}>
                          {conn.status === "CUT" ? "Suspend" : "Active"}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary me-2"
                          title="Editar conexión"
                          onClick={() => setEditingConn(conn)}
                        >
                          <i className="fa-solid fa-pen-to-square" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary me-2"
                          title="Detalles"
                          onClick={() => setConnDetails(conn)}
                        >
                          <i className="fa-solid fa-circle-info" />
                        </button>
                        <button
                          type="button"
                          className={`btn btn-sm ${conn.status === "CUT" ? "btn-outline-success" : "btn-outline-danger"}`}
                          title={conn.status === "CUT" ? "Restaurar" : "Cortar"}
                          onClick={() => cutRestore(conn)}
                        >
                          <i className={`fa-solid ${conn.status === "CUT" ? "fa-rotate-left" : "fa-ban"}`} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          ) : (
            tab === "billing" ? (
            <div>
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
                <div className="text-muted">Facturas del cliente</div>
                <div className="d-flex gap-2">
                  <Button
                    variant="primary"
                    onClick={() => {
                      setShowNewInvoice(true);
                    }}
                  >
                    <i className="fa-solid fa-plus me-2" />
                    Nueva factura
                  </Button>
                </div>
              </div>

              <div className="table-responsive">
                <table className="table table-bordered table-hover">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Conexión</th>
                      <th>Fecha</th>
                      <th>Vence</th>
                      <th>Estado</th>
                      <th>Total</th>
                      <th>Pagado</th>
                      <th style={{ width: 240 }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((x) => (
                      <tr key={x.id}>
                        <td>#{x.id}</td>
                        <td>{x.connection_id ?? "-"}</td>
                        <td>{x.issue_date ?? "-"}</td>
                        <td>{x.due_date ?? "-"}</td>
                        <td>{statusBadge(x.payment_status ?? x.status)}</td>
                        <td>{x.total}</td>
                        <td>{x.paid_total ?? "0"}</td>
                        <td>
                          {x.status === "ISSUED" || x.status === "DRAFT" ? (
                            <Button variant="primary" onClick={() => openPay(x)}>
                              Registrar pago
                            </Button>
                          ) : null}
                          <Button variant="danger" onClick={() => deleteInvoice(x.id)}>
                            Eliminar
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!invoices.length ? <div className="text-muted">Sin facturas.</div> : null}
              </div>
            </div>
            ) : (
              <div>
                <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
                  <div className="text-muted">Reclamos del cliente</div>
                  <div className="d-flex gap-2">
                    <Button variant="primary" onClick={() => setShowNewComplaint(true)}>
                      <i className="fa-solid fa-plus me-2" />
                      Nuevo reclamo
                    </Button>
                    <Button variant="default" onClick={reloadDetail}>
                      <i className="fa-solid fa-rotate me-2" />
                      Recargar
                    </Button>
                  </div>
                </div>

                <div className="table-responsive">
                  <table className="table table-bordered table-hover">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Fecha</th>
                        <th>Tipo</th>
                        <th>Conexión</th>
                        <th>Detalle</th>
                        <th>Estado</th>
                        <th>Solución</th>
                        <th>Tiempo</th>
                        <th style={{ width: 220 }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {complaints.map((x) => (
                        <tr key={x.id}>
                          <td>#{x.id}</td>
                          <td>{(x.created_at ?? "").slice(0, 10) || "-"}</td>
                          <td>{x.kind === "BILLING" ? "Facturación" : "Técnico"}</td>
                          <td>{x.connection_id}</td>
                          <td style={{ maxWidth: 420, whiteSpace: "pre-wrap" }}>{x.detail}</td>
                          <td>
                            <span className={`badge ${x.status === "SOLVED" ? "text-bg-success" : x.status === "WIP" ? "text-bg-warning" : "text-bg-secondary"}`}>
                              {x.status}
                            </span>
                          </td>
                          <td>{x.solved_at ? String(x.solved_at).slice(0, 10) : "-"}</td>
                          <td>{x.solved_human ?? "-"}</td>
                          <td>
                            <select
                              className="form-select form-select-sm"
                              value={x.status}
                              disabled={x.status === "SOLVED"}
                              onChange={async (e) => {
                                const next = (e.target.value || "").toUpperCase();
                                try {
                                  await api.updateComplaint(Number(x.id), { status: next });
                                  await reloadDetail();
                                } catch (err: any) {
                                  setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? err)}`);
                                }
                              }}
                            >
                              <option value="TODO">TODO</option>
                              <option value="WIP">WIP</option>
                              <option value="SOLVED">SOLVED</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!complaints.length ? <div className="text-muted">Sin reclamos.</div> : null}
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

