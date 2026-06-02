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
import { IpPoolPicker } from "../components/IpPoolPicker";
import { Grid, Table, Alert, Badge, Group, Stack, TextInput, Select, Text, Anchor, Pagination, Skeleton, Tabs, ActionIcon, Tooltip } from "@mantine/core";

type SortCol = "id" | "full_name" | "address" | "phone" | "email" | "debt_total" | "services_status" | "connections_count";

/** Client detail as returned by API, used for InvoiceModal/ComplaintModal props */
type ClientDetailData = {
  id: number;
  kind?: string;
  connections?: { id: number; plan_profile?: string; service_address?: string }[];
  full_name?: string;
  dni?: string;
  cuit?: string;
  phone?: string;
  email?: string;
  address?: string;
  is_active?: boolean;
  [key: string]: unknown;
};

/** Connection row shape for ConnectionDetailsModal */
type ConnectionDetailsData = {
  id: number;
  pppoe_name?: string;
  plan_profile?: string;
  status?: string;
  server_name?: string;
  server_id?: number;
  ip?: string;
  last_uptime?: string;
  last_connected_at?: string;
  last_disconnected_at?: string;
};

export default function ClientsPage() {
  const params = useParams();
  const navigate = useNavigate();
  const loc = useLocation();
  const [mode, setMode] = useState<"list" | "create" | "detail">("list");
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [clientId, setClientId] = useState<number | null>(null);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState<SortCol>("id");
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
  const [serverId, setServerId] = useState("");
  const [ip, setIp] = useState("");
  const [ipMode, setIpMode] = useState<"auto" | "manual">("auto");
  const [servers, setServers] = useState<{ id: number; name: string; host: string; port: number }[]>([]);
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
  }, [desiredMode, params.clientId]);

  async function reloadList() {
    setError(null);
    try {
      const offset = Math.max(0, (page - 1) * pageSize);
      const res = await api.listClients({ q: q || "", limit: pageSize, offset, sort_by: sortBy, sort_dir: sortDir }) as { items?: unknown[]; total?: number } | unknown[];
      const list = Array.isArray(res) ? res : (res as { items?: unknown[] })?.items ?? [];
      setItems(list as Record<string, unknown>[]);
      setTotal(Number(Array.isArray(res) ? list.length : (res as { total?: number })?.total ?? 0));
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    }
  }

  useEffect(() => {
    const fallbackProfiles = ["25M", "50M", "100M", "300M"];
    (async () => {
      try {
        const plans = await api.listPlans(true);
        const arr = Array.isArray(plans) ? plans : [];
        const profiles = arr.map((p: { profile?: string }) => p.profile).filter(Boolean) as string[];
        if (profiles.length) {
          setPlanOptions(Array.from(new Set(profiles)).sort());
          return;
        }
      } catch {
        /* intentar fallback legacy */
      }
      try {
        const kv = (await api.getSettings("plan.price.")) as Record<string, string>;
        const keys = Object.keys(kv)
          .filter((key) => key.startsWith("plan.price."))
          .map((key) => key.replace("plan.price.", ""));
        const unique = Array.from(new Set(keys)).sort();
        setPlanOptions(unique.length ? unique : fallbackProfiles);
      } catch {
        setPlanOptions(fallbackProfiles);
      }
    })();
    api.listServers().then((xs: unknown) => setServers((xs as { id: number; name: string; host: string; port: number }[]) || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (desiredMode !== "list") return;
    const t = setTimeout(() => reloadList(), 250);
    return () => clearTimeout(t);
  }, [desiredMode, q, page, pageSize, sortBy, sortDir]);

  async function create() {
    setError(null);
    setSuccess(null);
    try {
      const res = await api.createClient({
        kind,
        full_name: fullName,
        dni: kind === "PERSON" ? dni || null : null,
        cuit: kind === "COMPANY" ? cuit || null : null,
        phone: phone || null,
        email: email || null,
        address: address || null,
        connections: [{
          server_id: serverId ? Number(serverId) : null,
          ip: ipMode === "manual" ? (ip || null) : null,
          plan_profile: planProfile,
          service_address: serviceAddress || null,
          location: location || null,
        }],
        provision_mikrotik: true,
      }) as { client?: { id?: number }; id?: number };
      const created = res?.client ?? res;
      const newId = Number(created?.id ?? (created as { id?: number })?.id);
      if (!newId || Number.isNaN(newId)) {
        setSuccess("Cliente creado.");
        navigate("/clients");
        return;
      }
      setFullName(""); setDni(""); setCuit(""); setPhone(""); setEmail(""); setAddress("");
      setServiceAddress(""); setLocation(""); setServerId(""); setIp(""); setIpMode("auto");
      setSuccess(`Cliente #${newId} creado correctamente.`);
      setClientId(newId);
      navigate(`/clients/${newId}`);
    } catch (e: unknown) {
      const body = (e as { body?: { error?: string; client_id?: number; value?: string; cidr?: string } })?.body ?? e;
      const err = e as { status?: number; body?: { error?: string; client_id?: number; value?: string; cidr?: string } };
      const errCode = (body as { error?: string })?.error;
      if (err?.status === 409 && errCode === "dni_already_exists") {
        setError(`DNI ya existe (cliente #${(body as { client_id?: number })?.client_id}).`);
        return;
      }
      if (err?.status === 409 && errCode === "cuit_already_exists") {
        setError(`CUIT ya existe (cliente #${(body as { client_id?: number })?.client_id}).`);
        return;
      }
      if (err?.status === 409 && errCode === "pool_exhausted") {
        setError(`No hay IPs libres en el pool ${(body as { cidr?: string })?.cidr || ""} del server seleccionado.`);
        return;
      }
      if (err?.status === 400 && errCode === "ip_already_taken") {
        setError(`La IP ${(body as { value?: string })?.value} ya está asignada a otra conexión de este server.`);
        return;
      }
      if (err?.status === 400 && errCode === "ip_invalid") {
        setError(`IP inválida${(body as { value?: string })?.value ? `: ${(body as { value?: string })?.value}` : ""}.`);
        return;
      }
      setError(`${err?.status ?? ""} ${JSON.stringify(body)}`);
    }
  }

  function toggleSort(col: SortCol) {
    if (sortBy === col) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
    setPage(1);
  }

  function servicesBadge(c: Record<string, unknown>) {
    const clientStatus = String(c?.status ?? "ACTIVE");
    const s = String(c?.services_status ?? "");
    if (clientStatus === "RETIRED") return <Badge color="dark">Retirado</Badge>;
    if (s === "SUSPENDED") return <Badge color="red">Suspendido</Badge>;
    if (s === "ACTIVE") return <Badge color="green">Activo</Badge>;
    return <Badge color="gray">{s || "-"}</Badge>;
  }

  const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));
  const start = total ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(total, (page - 1) * pageSize + items.length);
  const serverData = [{ value: "", label: "(Seleccionar servidor)" }, ...servers.map((s) => ({ value: String(s.id), label: `#${s.id} — ${s.name} (${s.host}:${s.port})` }))];
  const planData = planOptions.map((p) => ({ value: p, label: p }));

  return (
    <Stack gap="md">
      <ClientEditModal open={editingClientId != null} clientId={editingClientId} onClose={() => setEditingClientId(null)} onSaved={async () => { setEditingClientId(null); await reloadList(); }} />

      {mode === "detail" && clientId && success ? (
        <Alert color="green" title="Éxito" onClose={() => setSuccess(null)} withCloseButton>{success}</Alert>
      ) : null}

      {mode === "detail" && clientId ? (
        <ClientDetail clientId={clientId} onBack={() => { setSuccess(null); navigate("/clients"); }} onEdit={() => setEditingClientId(clientId)} servers={servers} planOptions={planOptions} />
      ) : null}

      {mode === "create" ? (
        <Card title="Crear nuevo cliente">
          <Grid>
            <Grid.Col span={{ base: 12, lg: 6 }}>
              <Card title="Datos del cliente">
                <Group mb="sm">
                  <Button variant={kind === "PERSON" ? "primary" : "default"} onClick={() => { setKind("PERSON"); setCuit(""); }}>Persona</Button>
                  <Button variant={kind === "COMPANY" ? "primary" : "default"} onClick={() => { setKind("COMPANY"); setDni(""); }}>Empresa</Button>
                </Group>
                <Field label="Nombre / Razón social" value={fullName} onChange={setFullName} />
                {kind === "PERSON" ? <Field label="DNI" value={dni} onChange={setDni} /> : <Field label="CUIT" value={cuit} onChange={setCuit} />}
                <Grid><Grid.Col span={6}><Field label="Tel/Cel" value={phone} onChange={setPhone} /></Grid.Col><Grid.Col span={6}><Field label="Email" value={email} onChange={setEmail} /></Grid.Col></Grid>
                <Field label="Dirección (facturación / principal)" value={address} onChange={setAddress} />
              </Card>
            </Grid.Col>
            <Grid.Col span={{ base: 12, lg: 6 }}>
              <Card title="Datos de la conexión (servicio)">
                <Select label="Servidor PPPoE (Mikrotik)" value={serverId} onChange={(v) => v != null && setServerId(v)} data={serverData} />
                {!servers.length ? <Text c="dimmed">No hay servidores cargados. Crealos en Red.</Text> : null}
                <Select label="Plan" value={planProfile} onChange={(v) => v && setPlanProfile(v)} data={planData} mt="sm" />
                <Field label="Domicilio del servicio" value={serviceAddress} onChange={setServiceAddress} />
                <Field label="Ubicación (referencia / GPS / barrio)" value={location} onChange={setLocation} />
                <IpPoolPicker
                  serverId={serverId ? Number(serverId) : null}
                  ip={ip}
                  onChange={setIp}
                  mode={ipMode}
                  onModeChange={setIpMode}
                />
              </Card>
            </Grid.Col>
          </Grid>
          <Group mt="md">
            <Button variant="primary" onClick={create}>Guardar</Button>
            <Button variant="default" onClick={() => { setError(null); setSuccess(null); navigate("/clients"); }}>Cancelar</Button>
          </Group>
          {error ? <Alert color="red" className="sc-error" title="Error" mt="md">{error}</Alert> : null}
        </Card>
      ) : null}

      {mode === "list" ? (
        <Card
          title="Clientes"
          footer={
            <Group justify="space-between">
              <Text>Mostrando <b>{start}</b>-<b>{end}</b> de <b>{total}</b></Text>
              <Pagination total={totalPages} value={page} onChange={setPage} withEdges />
            </Group>
          }
        >
          <Group align="flex-end" mb="md" wrap="wrap">
            <TextInput placeholder="nombre, dni/cuit, tel, email, id..." value={q} onChange={(e) => { setQ(e.currentTarget.value); setPage(1); }} style={{ minWidth: 260 }} />
            <Select value={String(pageSize)} onChange={(v) => { setPageSize(Number(v ?? 10)); setPage(1); }} data={["10", "50", "100"]} style={{ width: 120 }} />
            <Group gap="xs">
              <Button variant="primary" onClick={() => navigate("/clients/new")}>Crear nuevo cliente</Button>
              <Button variant="default" onClick={reloadList}>Recargar</Button>
            </Group>
          </Group>
          {error ? <Alert color="red" className="sc-error" title="Error">{error}</Alert> : null}
          <Table.ScrollContainer minWidth={900}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ cursor: "pointer" }} onClick={() => toggleSort("id")}>ID</Table.Th>
                  <Table.Th style={{ cursor: "pointer" }} onClick={() => toggleSort("full_name")}>Nombre</Table.Th>
                  <Table.Th style={{ cursor: "pointer" }} onClick={() => toggleSort("address")}>Dirección</Table.Th>
                  <Table.Th style={{ cursor: "pointer" }} onClick={() => toggleSort("phone")}>Tel</Table.Th>
                  <Table.Th style={{ cursor: "pointer" }} onClick={() => toggleSort("email")}>Email</Table.Th>
                  <Table.Th style={{ cursor: "pointer" }} onClick={() => toggleSort("debt_total")}>Deuda</Table.Th>
                  <Table.Th style={{ cursor: "pointer" }} onClick={() => toggleSort("services_status")}>Estado</Table.Th>
                  <Table.Th style={{ cursor: "pointer" }} onClick={() => toggleSort("connections_count")}>Conexiones</Table.Th>
                  <Table.Th>Acciones</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {items.map((c) => (
                  <Table.Tr key={Number(c.id)} style={{ cursor: "pointer" }} onClick={() => navigate(`/clients/${c.id}`)}>
                    <Table.Td>#{String(c.id)}</Table.Td>
                    <Table.Td>
                      <Badge color={c.kind === "COMPANY" ? "blue" : "cyan"} variant="light" mr="xs">{c.kind === "COMPANY" ? "Empresa" : "Persona"}</Badge>
                      {String(c.full_name ?? "")}
                    </Table.Td>
                    <Table.Td>{String(c.address ?? "-")}</Table.Td>
                    <Table.Td>{String(c.phone ?? "-")}</Table.Td>
                    <Table.Td>{String(c.email ?? "-")}</Table.Td>
                    <Table.Td><Badge color={Number(c.debt_total ?? 0) > 0 ? "red" : "green"}>AR$ {String(c.debt_total ?? "0")}</Badge></Table.Td>
                    <Table.Td>{servicesBadge(c)}</Table.Td>
                    <Table.Td>{String(c.connections_count ?? 0)}</Table.Td>
                    <Table.Td onClick={(e) => e.stopPropagation()}>
                      <Group gap="xs">
                        <Button variant="default" onClick={() => setEditingClientId(Number(c.id))}>Editar</Button>
                        <Button variant="danger" onClick={async () => {
                          if (!window.confirm("¿Eliminar cliente y conexiones?")) return;
                          await api.deleteClient(Number(c.id));
                          if (items.length === 1 && page > 1) setPage(page - 1);
                          else await reloadList();
                        }}>Eliminar</Button>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      ) : null}
    </Stack>
  );
}

function statusBadge(paymentStatus: string) {
  if (paymentStatus === "PAID") return <Badge color="green">Pagada</Badge>;
  if (paymentStatus === "OVERDUE") return <Badge color="red">Vencida</Badge>;
  if (paymentStatus === "UNPAID") return <Badge color="yellow">Impaga</Badge>;
  if (paymentStatus === "DRAFT") return <Badge color="gray">Draft</Badge>;
  return <Badge color="gray">{paymentStatus}</Badge>;
}

function ClientDetail(props: { clientId: number; onBack: () => void; onEdit: () => void; servers: { id: number; name: string; host: string; port: number }[]; planOptions: string[] }) {
  const [client, setClient] = useState<ClientDetailData | null>(null);
  const [invoices, setInvoices] = useState<Record<string, unknown>[]>([]);
  const [complaints, setComplaints] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [showNewComplaint, setShowNewComplaint] = useState(false);
  const [showNewConnection, setShowNewConnection] = useState(false);
  const [paying, setPaying] = useState<unknown>(null);
  const [connDetails, setConnDetails] = useState<ConnectionDetailsData | null>(null);
  const [editingConn, setEditingConn] = useState<unknown>(null);
  const [tab, setTab] = useState<"connections" | "billing" | "complaints">("connections");
  const [sendingEmail, setSendingEmail] = useState<number | null>(null);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);

  function openPdf(id: number) {
    const url = api.getInvoicePdfUrl(id);
    window.open(url, "_blank");
  }

  async function sendEmail(id: number) {
    setError(null);
    setEmailSuccess(null);
    setSendingEmail(id);
    try {
      const res = (await api.sendInvoiceEmail(id)) as { ok: boolean; to: string; message: string };
      setEmailSuccess(res.message || `Enviada a ${res.to}`);
    } catch (e: unknown) {
      const err = e as { status?: number; body?: any };
      const msg = err?.body?.message || JSON.stringify(err?.body ?? e);
      setError(`Error enviando email: ${msg}`);
    } finally {
      setSendingEmail(null);
    }
  }

  async function reloadDetail() {
    setError(null);
    try {
      const c = await api.getClient(props.clientId);
      setClient(c as ClientDetailData);
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    }
    try {
      const inv = await api.listInvoices(props.clientId);
      setInvoices(Array.isArray(inv) ? inv : []);
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    }
    try {
      const items = await api.listComplaints(props.clientId);
      setComplaints(Array.isArray(items) ? items : []);
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    }
  }

  useEffect(() => { reloadDetail(); }, [props.clientId]);

  async function cutRestore(conn: { id: number; status?: string }) {
    setError(null);
    try {
      if (conn.status === "CUT") await api.restoreConnection(conn.id);
      else await api.cutConnection(conn.id, "suspended");
      await reloadDetail();
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    }
  }

  async function deleteInvoice(id: number) {
    setError(null);
    try {
      if (!window.confirm("¿Eliminar factura? (baja lógica, solo si no tiene pagos)")) return;
      await api.deleteInvoice(id);
      setPaying(null);
      await reloadDetail();
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    }
  }

  async function suspendAllServices() {
    setError(null);
    try {
      if (!window.confirm("¿Suspender TODOS los servicios del cliente? (Se aplicará suspended)")) return;
      await api.suspendClientServices(props.clientId, "suspended");
      await reloadDetail();
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    }
  }

  const connections = (client?.connections ?? []) as { id: number; pppoe_name?: string; server_name?: string; ip?: string; plan_profile?: string; service_address?: string; status?: string }[];

  return (
    <Stack gap="md">
      <InvoiceModal open={showNewInvoice} client={client ?? undefined} connections={client?.connections ?? []} onClose={() => setShowNewInvoice(false)} onSaved={async () => { setShowNewInvoice(false); await reloadDetail(); }} />
      <ComplaintModal open={showNewComplaint} client={client} connections={client?.connections ?? []} onClose={() => setShowNewComplaint(false)} onSaved={async () => { setShowNewComplaint(false); await reloadDetail(); }} />
      <PaymentModal open={!!paying} invoice={paying} onClose={() => setPaying(null)} onSaved={async () => { setPaying(null); await reloadDetail(); }} />
      <ConnectionDetailsModal open={!!connDetails} connection={connDetails} onClose={() => setConnDetails(null)} onSaved={async () => { setConnDetails(null); await reloadDetail(); }} />
      <ConnectionCreateModal open={showNewConnection} clientId={props.clientId} servers={props.servers} planOptions={props.planOptions} onClose={() => setShowNewConnection(false)} onSaved={async () => { setShowNewConnection(false); await reloadDetail(); }} />
      <ConnectionEditModal open={!!editingConn} connection={editingConn as { id: number } | null} servers={props.servers} planOptions={props.planOptions} onClose={() => setEditingConn(null)} onSaved={async () => { setEditingConn(null); await reloadDetail(); }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Card
          title={`Cliente #${props.clientId}`}
          headerRight={
            <Group gap="xs">
              <Button variant="default" onClick={props.onBack}>Volver</Button>
              <Button variant="primary" onClick={props.onEdit}>Editar</Button>
              <Button variant="warning" onClick={suspendAllServices}>Suspender</Button>
              <Button variant="default" onClick={reloadDetail}>Recargar</Button>
            </Group>
          }
        >
          {error ? <Alert color="red" className="sc-error" title="Error">{error}</Alert> : null}
          {client ? (
            <Grid>
              <Grid.Col span={6}>
                <Text fw={600}>{String(client.full_name)}</Text>
                <Badge color="gray" ml="xs">{String(client.kind)}</Badge>
                <Text c="dimmed">{client.kind === "PERSON" ? `DNI: ${client.dni ?? "-"}` : `CUIT: ${client.cuit ?? "-"}`}</Text>
                <Text c="dimmed">Tel/Cel: {String(client.phone ?? "-")}</Text>
                <Text c="dimmed">Email: {String(client.email ?? "-")}</Text>
              </Grid.Col>
              <Grid.Col span={6}>
                <Text c="dimmed">Dirección: {String(client.address ?? "-")}</Text>
                <Text c="dimmed">Activo: {client.is_active ? "Sí" : "No"}</Text>
                <Text c="dimmed">Conexiones: {(client.connections as unknown[])?.length ?? 0}</Text>
                <Text c="dimmed">Facturas: {invoices.length}</Text>
              </Grid.Col>
            </Grid>
          ) : (
            <Text c="dimmed">Cargando...</Text>
          )}
        </Card>

        <Card>
          <Tabs value={tab} onChange={(v) => v && setTab(v as "connections" | "billing" | "complaints")}>
            <Tabs.List grow>
              <Tabs.Tab value="connections">Conexiones</Tabs.Tab>
              <Tabs.Tab value="billing">Facturación</Tabs.Tab>
              <Tabs.Tab value="complaints">Reclamos</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="connections" pt="md" px="md" pb="md">
              <Group justify="space-between" mb="sm">
                <Text c="dimmed">Conexiones del cliente</Text>
                <Button variant="primary" onClick={() => setShowNewConnection(true)}>Nueva conexión</Button>
              </Group>
              <Table.ScrollContainer minWidth={700}>
                <Table>
                  <Table.Thead>
                    <Table.Tr><Table.Th>ID</Table.Th><Table.Th>PPPoE</Table.Th><Table.Th>Server</Table.Th><Table.Th>IP</Table.Th><Table.Th>Plan</Table.Th><Table.Th>Domicilio</Table.Th><Table.Th>Estado</Table.Th><Table.Th>Acciones</Table.Th></Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {connections.map((conn) => (
                      <Table.Tr
                        key={conn.id}
                        style={{ cursor: "pointer" }}
                        onClick={() => setConnDetails(conn)}
                      >
                        <Table.Td>#{conn.id}</Table.Td>
                        <Table.Td>{conn.pppoe_name}</Table.Td>
                        <Table.Td>{conn.server_name ?? "-"}</Table.Td>
                        <Table.Td onClick={(e) => e.stopPropagation()}>
                          {conn.ip ? <Anchor href={`http://${String(conn.ip).trim()}`} target="_blank" rel="noopener noreferrer">{conn.ip}</Anchor> : "-"}
                        </Table.Td>
                        <Table.Td>{conn.plan_profile}</Table.Td>
                        <Table.Td>{conn.service_address ?? "-"}</Table.Td>
                        <Table.Td><Badge color={conn.status === "CUT" ? "red" : "green"}>{conn.status === "CUT" ? "Suspend" : "Active"}</Badge></Table.Td>
                        <Table.Td onClick={(e) => e.stopPropagation()}>
                          <Group gap="xs">
                            <Button variant="default" onClick={() => setEditingConn(conn)}>Editar</Button>
                            <Button variant={conn.status === "CUT" ? "primary" : "danger"} onClick={() => cutRestore(conn)}>{conn.status === "CUT" ? "Restaurar" : "Cortar"}</Button>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </Tabs.Panel>
            <Tabs.Panel value="billing" pt="md" px="md" pb="md">
              <Group justify="space-between" mb="md">
                <Text c="dimmed">Facturas del cliente</Text>
                <Button variant="primary" onClick={() => setShowNewInvoice(true)}>Nueva factura</Button>
              </Group>
              {emailSuccess ? (
                <Alert color="green" title="Email enviado" withCloseButton onClose={() => setEmailSuccess(null)} mb="sm">
                  {emailSuccess}
                </Alert>
              ) : null}
              <Table.ScrollContainer minWidth={700}>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>ID</Table.Th>
                      <Table.Th>Tipo</Table.Th>
                      <Table.Th>Concepto</Table.Th>
                      <Table.Th>Fecha</Table.Th>
                      <Table.Th>Vence</Table.Th>
                      <Table.Th>Estado</Table.Th>
                      <Table.Th>Total</Table.Th>
                      <Table.Th>Pagado</Table.Th>
                      <Table.Th>Acciones</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {invoices.map((x) => (
                      <Table.Tr key={Number(x.id)}>
                        <Table.Td>#{String(x.id)}</Table.Td>
                        <Table.Td><Badge variant="light" size="sm">{String(x.invoice_type ?? "-")}</Badge></Table.Td>
                        <Table.Td style={{ maxWidth: 180 }}>
                          <Text size="sm" truncate>{String(x.description || "Servicio")}</Text>
                        </Table.Td>
                        <Table.Td>{String(x.issue_date ?? "-")}</Table.Td>
                        <Table.Td>{String(x.due_date ?? "-")}</Table.Td>
                        <Table.Td>{statusBadge(String(x.payment_status ?? x.status ?? ""))}</Table.Td>
                        <Table.Td fw={600}>${String(x.total)}</Table.Td>
                        <Table.Td>${String(x.paid_total ?? "0")}</Table.Td>
                        <Table.Td>
                          <Group gap={4} wrap="nowrap">
                            <Tooltip label="Ver PDF">
                              <ActionIcon variant="light" color="blue" onClick={() => openPdf(Number(x.id))}>
                                📄
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label="Enviar vía Mail">
                              <ActionIcon
                                variant="light"
                                color="teal"
                                loading={sendingEmail === Number(x.id)}
                                onClick={() => sendEmail(Number(x.id))}
                              >
                                ✉️
                              </ActionIcon>
                            </Tooltip>
                            {(x.status === "ISSUED" || x.status === "DRAFT") ? (
                              <Button variant="primary" onClick={() => setPaying(x)}>Pagar</Button>
                            ) : null}
                            <Button variant="danger" onClick={() => deleteInvoice(Number(x.id))}>Eliminar</Button>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
              {!invoices.length ? <Text c="dimmed">Sin facturas.</Text> : null}
            </Tabs.Panel>
            <Tabs.Panel value="complaints" pt="md" px="md" pb="md">
              <Group justify="space-between" mb="md">
                <Text c="dimmed">Reclamos del cliente</Text>
                <Group><Button variant="primary" onClick={() => setShowNewComplaint(true)}>Nuevo reclamo</Button><Button variant="default" onClick={reloadDetail}>Recargar</Button></Group>
              </Group>
              <Table.ScrollContainer minWidth={700}>
                <Table>
                  <Table.Thead>
                    <Table.Tr><Table.Th>ID</Table.Th><Table.Th>Fecha</Table.Th><Table.Th>Tipo</Table.Th><Table.Th>Conexión</Table.Th><Table.Th>Detalle</Table.Th><Table.Th>Estado</Table.Th><Table.Th>Solución</Table.Th><Table.Th>Tiempo</Table.Th><Table.Th>Acciones</Table.Th></Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {complaints.map((x) => (
                      <Table.Tr key={Number(x.id)}>
                        <Table.Td>#{String(x.id)}</Table.Td>
                        <Table.Td>{String((x.created_at as string) ?? "").slice(0, 10) || "-"}</Table.Td>
                        <Table.Td>{x.kind === "BILLING" ? "Facturación" : "Técnico"}</Table.Td>
                        <Table.Td>{String(x.connection_id ?? "-")}</Table.Td>
                        <Table.Td style={{ maxWidth: 420, whiteSpace: "pre-wrap" }}>{String(x.detail ?? "")}</Table.Td>
                        <Table.Td><Badge color={x.status === "SOLVED" ? "green" : x.status === "WIP" ? "yellow" : "gray"}>{String(x.status)}</Badge></Table.Td>
                        <Table.Td>{x.solved_at ? String(x.solved_at).slice(0, 10) : "-"}</Table.Td>
                        <Table.Td>{String(x.solved_human ?? "-")}</Table.Td>
                        <Table.Td>
                          <Select
                            value={String(x.status)}
                            disabled={x.status === "SOLVED"}
                            data={[{ value: "TODO", label: "TODO" }, { value: "WIP", label: "WIP" }, { value: "SOLVED", label: "SOLVED" }]}
                            onChange={async (v) => {
                              if (!v) return;
                              try {
                                await api.updateComplaint(Number(x.id), { status: v.toUpperCase() });
                                await reloadDetail();
                              } catch (err: unknown) {
                                const e = err as { status?: number; body?: unknown };
                                setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? err)}`);
                              }
                            }}
                          />
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
              {!complaints.length ? <Text c="dimmed">Sin reclamos.</Text> : null}
            </Tabs.Panel>
          </Tabs>
        </Card>
        </div>
      </Stack>
    );
}
