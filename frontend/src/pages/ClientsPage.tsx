import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { Button, Card, Field, MutedBadge, MUTED_DISCONNECT_STYLE, InvoiceStatusBadge, connectionStatusTone, complaintStatusTone, clientServicesTone } from "../ui";
import { InvoiceModal } from "../components/InvoiceModal";
import { ComplaintModal } from "../components/ComplaintModal";
import { PaymentModal } from "../components/PaymentModal";
import { ConnectionDetailsModal } from "../components/ConnectionDetailsModal";
import { ClientEditModal } from "../components/ClientEditModal";
import { ConnectionCreateModal } from "../components/ConnectionCreateModal";
import { ConnectionEditModal } from "../components/ConnectionEditModal";
import { IpPoolPicker } from "../components/IpPoolPicker";
import { ConfirmDialog, ConfirmState } from "../components/ConfirmDialog";
import { CoverageCheck, CoveragePreview } from "../components/CoverageCheck";
import { CoverageMap } from "../components/CoverageMap";
import { formatApiError, fmtMoney, connectionStatusLabel, complaintStatusLabel } from "../format";
import { fmtDate } from "../datetime";
import { notifySuccess, notifyError } from "../notify";
import { Grid, Table, Alert, Group, Stack, TextInput, Select, Text, Anchor, Pagination, Tabs, ActionIcon, Tooltip, Menu, Skeleton, Box, Divider, Stepper, Avatar, SimpleGrid, Modal, UnstyledButton, Paper } from "@mantine/core";
import { IconDots, IconFileTypePdf, IconMail, IconArrowLeft, IconCash, IconTrash, IconFileCheck, IconBrandWhatsapp, IconMapPin, IconPencil, IconPlugConnectedX, IconRestore, IconAlertTriangle, IconRefresh } from "@tabler/icons-react";

type SortCol = "id" | "full_name" | "dni" | "address" | "phone" | "email" | "debt_total" | "services_status" | "connections_count";

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
  location_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  nap_name?: string | null;
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

const SORT_COLS: SortCol[] = ["id", "full_name", "dni", "address", "phone", "email", "debt_total", "services_status", "connections_count"];

export default function ClientsPage() {
  const params = useParams();
  const navigate = useNavigate();
  const loc = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [mode, setMode] = useState<"list" | "create" | "detail">("list");
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Estado de la lista inicializado desde la URL para permitir deep-linking (?q=...&page=...).
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const [clientId, setClientId] = useState<number | null>(null);
  const [pageSize, setPageSize] = useState(() => {
    const n = Number(searchParams.get("ps"));
    return [10, 50, 100].includes(n) ? n : 10;
  });
  const [page, setPage] = useState(() => Math.max(1, Number(searchParams.get("page")) || 1));
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState<SortCol>(() => {
    const s = searchParams.get("sort") as SortCol | null;
    return s && SORT_COLS.includes(s) ? s : "id";
  });
  const [sortDir, setSortDir] = useState<"asc" | "desc">(() =>
    searchParams.get("dir") === "asc" ? "asc" : "desc"
  );
  const [editingClientId, setEditingClientId] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [saving, setSaving] = useState(false);
  const [kind, setKind] = useState<"PERSON" | "COMPANY">("PERSON");
  const [fullName, setFullName] = useState("");
  const [dni, setDni] = useState("");
  const [cuit, setCuit] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [ponSn, setPonSn] = useState("");
  const [planProfile, setPlanProfile] = useState("50M");
  const [serviceAddress, setServiceAddress] = useState("");
  const [location, setLocation] = useState("");
  const [locationUrl, setLocationUrl] = useState("");
  const [coverage, setCoverage] = useState<CoveragePreview | null>(null);
  const [createStep, setCreateStep] = useState(0);
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
      setCreateStep(0);
      setMode("create");
      return;
    }
    setClientId(null);
    setMode("list");
  }, [desiredMode, params.clientId]);

  async function reloadList() {
    setError(null);
    setListLoading(true);
    try {
      const offset = Math.max(0, (page - 1) * pageSize);
      const res = await api.listClients({ q: q || "", limit: pageSize, offset, sort_by: sortBy, sort_dir: sortDir }) as { items?: unknown[]; total?: number } | unknown[];
      const list = Array.isArray(res) ? res : (res as { items?: unknown[] })?.items ?? [];
      setItems(list as Record<string, unknown>[]);
      setTotal(Number(Array.isArray(res) ? list.length : (res as { total?: number })?.total ?? 0));
    } catch (e: unknown) {
      setError(formatApiError(e));
    } finally {
      setListLoading(false);
    }
  }

  // Refleja el estado de la lista en la URL (deep-linking y navegación con atrás/adelante).
  useEffect(() => {
    if (desiredMode !== "list") return;
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (page > 1) p.set("page", String(page));
    if (pageSize !== 10) p.set("ps", String(pageSize));
    if (sortBy !== "id") p.set("sort", sortBy);
    if (sortDir !== "desc") p.set("dir", sortDir);
    if (p.toString() !== searchParams.toString()) setSearchParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desiredMode, q, page, pageSize, sortBy, sortDir]);

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
    if (saving) return;
    setError(null);
    setSuccess(null);
    if (!fullName.trim()) {
      setError("Ingresá el nombre o razón social del cliente.");
      return;
    }
    setSaving(true);
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
          location_url: locationUrl || null,
          pon_sn: ponSn || null,
        }],
        provision_mikrotik: true,
      }) as { client?: { id?: number }; id?: number; installation_orders?: { id: number; status: string; nap_name?: string; fiber_meters?: string }[] };
      const created = res?.client ?? res;
      const newId = Number(created?.id ?? (created as { id?: number })?.id);
      if (!newId || Number.isNaN(newId)) {
        setSuccess("Cliente creado.");
        navigate("/clients");
        return;
      }
      setFullName(""); setDni(""); setCuit(""); setPhone(""); setEmail(""); setAddress("");
      setServiceAddress(""); setLocation(""); setLocationUrl(""); setCoverage(null); setServerId(""); setIp(""); setIpMode("auto"); setPonSn("");
      const order = res?.installation_orders?.[0];
      let orderMsg = "";
      if (order) {
        if (order.status === "RESERVADO") orderMsg = ` Orden de instalación #${order.id}: puerto reservado en ${order.nap_name ?? "NAP"}${order.fiber_meters ? ` (${order.fiber_meters} m de fibra)` : ""}.`;
        else if (order.status === "SIN_COBERTURA") orderMsg = ` Orden #${order.id}: SIN COBERTURA — quedó en el apartado "Sin cobertura" de Instalaciones.`;
        else orderMsg = ` Orden de instalación #${order.id} creada (${order.status}).`;
      }
      setSuccess(`Cliente #${newId} creado correctamente.${orderMsg}`);
      notifySuccess(`Cliente #${newId} creado correctamente.`);
      setClientId(newId);
      navigate(`/clients/${newId}`);
    } catch (e: unknown) {
      setError(formatApiError(e));
    } finally {
      setSaving(false);
    }
  }

  function toggleSort(col: SortCol) {
    if (sortBy === col) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
    setPage(1);
  }

  function SortTh(props: { col: SortCol; children: React.ReactNode }) {
    const active = sortBy === props.col;
    return (
      <Table.Th
        style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
        aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
        onClick={() => toggleSort(props.col)}
      >
        {props.children} {active ? (sortDir === "asc" ? "▲" : "▼") : null}
      </Table.Th>
    );
  }

  function servicesBadge(c: Record<string, unknown>) {
    const clientStatus = String(c?.status ?? "ACTIVE");
    const s = String(c?.services_status ?? "");
    let label = s || "-";
    if (clientStatus === "RETIRED") label = "Retirado";
    else if (s === "SUSPENDED") label = "Suspendido";
    else if (s === "ACTIVE") label = "Activo";
    return <MutedBadge tone={clientServicesTone(clientStatus, s)}>{label}</MutedBadge>;
  }

  const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));
  const start = total ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(total, (page - 1) * pageSize + items.length);
  const serverData = [{ value: "", label: "(Seleccionar servidor)" }, ...servers.map((s) => ({ value: String(s.id), label: `#${s.id} — ${s.name} (${s.host}:${s.port})` }))];
  const planData = planOptions.map((p) => ({ value: p, label: p }));

  return (
    <Stack gap="md">
      <ClientEditModal open={editingClientId != null} clientId={editingClientId} onClose={() => setEditingClientId(null)} onSaved={async () => { setEditingClientId(null); await reloadList(); }} />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />

      {mode === "detail" && clientId && success ? (
        <Alert color="green" title="Éxito" onClose={() => setSuccess(null)} withCloseButton>{success}</Alert>
      ) : null}

      {mode === "detail" && clientId ? (
        <ClientDetail clientId={clientId} onBack={() => { setSuccess(null); navigate("/clients"); }} onEdit={() => setEditingClientId(clientId)} servers={servers} planOptions={planOptions} />
      ) : null}

      {mode === "create" ? (
        <Card title="Crear nuevo cliente">
          <Stepper active={createStep} onStepClick={setCreateStep} size="sm" mb="md">
            <Stepper.Step label="Cliente" description="Datos personales">
              <Group mb="sm" mt="md">
                <Button variant={kind === "PERSON" ? "primary" : "default"} onClick={() => { setKind("PERSON"); setCuit(""); }}>Persona</Button>
                <Button variant={kind === "COMPANY" ? "primary" : "default"} onClick={() => { setKind("COMPANY"); setDni(""); }}>Empresa</Button>
              </Group>
              <Field label="Nombre / Razón social" required value={fullName} onChange={setFullName} maxLength={200} />
              {kind === "PERSON" ? <Field label="DNI" value={dni} onChange={setDni} maxLength={32} /> : <Field label="CUIT" value={cuit} onChange={setCuit} maxLength={32} />}
              <Grid><Grid.Col span={{ base: 12, md: 6 }}><Field label="Tel/Cel" value={phone} onChange={setPhone} maxLength={50} /></Grid.Col><Grid.Col span={{ base: 12, md: 6 }}><Field label="Email" value={email} onChange={setEmail} maxLength={200} /></Grid.Col></Grid>
              <Field label="Dirección (facturación / principal)" value={address} onChange={setAddress} maxLength={255} />
            </Stepper.Step>

            <Stepper.Step label="Ubicación" description="Cobertura en el mapa">
              <Stack mt="md" gap="xs">
                <Field label="Domicilio del servicio" value={serviceAddress} onChange={setServiceAddress} maxLength={255} />
                <Field label="Ubicación (referencia / barrio)" value={location} onChange={setLocation} maxLength={255} />
                <CoverageCheck
                  locationUrl={locationUrl}
                  onLocationUrlChange={setLocationUrl}
                  coverage={coverage}
                  onCoverageChange={setCoverage}
                  onError={setError}
                />
              </Stack>
            </Stepper.Step>

            <Stepper.Step label="Servicio" description="Plan y conexión">
              <Stack mt="md" gap="xs">
                <Select label="Servidor PPPoE (Mikrotik)" value={serverId} onChange={(v) => v != null && setServerId(v)} data={serverData} />
                {!servers.length ? <Text c="dimmed" size="sm">No hay servidores cargados. Crealos en Red.</Text> : null}
                <Select label="Plan" withAsterisk value={planProfile} onChange={(v) => v && setPlanProfile(v)} data={planData} />
                <IpPoolPicker
                  serverId={serverId ? Number(serverId) : null}
                  ip={ip}
                  onChange={setIp}
                  mode={ipMode}
                  onModeChange={setIpMode}
                />
                <Field label="PON SN (opcional)" value={ponSn} onChange={setPonSn} placeholder="ej: HWTC1234ABCD" maxLength={64} />
              </Stack>
            </Stepper.Step>

            <Stepper.Completed>
              <Stack mt="md" gap="xs">
                <Text fw={600}>Resumen</Text>
                <Text size="sm">
                  <b>{fullName || "(sin nombre)"}</b> · {kind === "PERSON" ? `DNI ${dni || "-"}` : `CUIT ${cuit || "-"}`} · Tel {phone || "-"}
                </Text>
                <Text size="sm">Servicio: plan <b>{planProfile}</b>{serverId ? ` · servidor #${serverId}` : " · sin servidor"} · IP {ipMode === "manual" && ip ? ip : "automática"}</Text>
                <Text size="sm">
                  Ubicación: {locationUrl || "(sin ubicación en mapa)"}
                  {coverage ? (
                    coverage.available
                      ? <> — <Text span c="green" fw={600}>con cobertura</Text> (NAP {coverage.chosen_nap?.name ?? "?"}, se reservará un puerto)</>
                      : <> — <Text span c="orange" fw={600}>sin cobertura</Text> (quedará en "Sin cobertura")</>
                  ) : locationUrl ? " — cobertura sin verificar (se chequea al guardar)" : null}
                </Text>
              </Stack>
            </Stepper.Completed>
          </Stepper>

          {error ? <Alert color="red" title="Error" mb="md">{error}</Alert> : null}

          <Group justify="space-between">
            <Button variant="default" disabled={saving} onClick={() => { setError(null); setSuccess(null); navigate("/clients"); }}>Cancelar</Button>
            <Group gap="xs">
              {createStep > 0 ? (
                <Button variant="default" disabled={saving} onClick={() => setCreateStep(createStep - 1)}>Atrás</Button>
              ) : null}
              {createStep < 3 ? (
                <Button
                  variant="primary"
                  onClick={() => {
                    if (createStep === 0 && !fullName.trim()) {
                      setError("Ingresá el nombre o razón social del cliente.");
                      return;
                    }
                    setError(null);
                    setCreateStep(createStep + 1);
                  }}
                >
                  Siguiente
                </Button>
              ) : (
                <Button variant="primary" loading={saving} onClick={create}>{saving ? "Guardando..." : "Crear cliente"}</Button>
              )}
            </Group>
          </Group>
        </Card>
      ) : null}

      {mode === "list" ? (
        <Card
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
              <Button variant="primaryLight" onClick={() => navigate("/clients/new")}>Nuevo cliente</Button>
              <Tooltip label="Recargar">
                <ActionIcon size="lg" variant="light" color="violet" onClick={reloadList} aria-label="Recargar">
                  <IconRefresh size={20} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
          {error ? <Alert color="red" title="Error" withCloseButton onClose={() => setError(null)}>{error}</Alert> : null}
          <Table.ScrollContainer minWidth={720}>
            <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <SortTh col="full_name">Cliente</SortTh>
                  <Table.Th>Plan</Table.Th>
                  <SortTh col="debt_total">Deuda</SortTh>
                  <SortTh col="services_status">Estado</SortTh>
                  <Table.Th>Acciones</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {listLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <Table.Tr key={i}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <Table.Td key={j}><Skeleton height={20} width="75%" /></Table.Td>
                      ))}
                    </Table.Tr>
                  ))
                ) : items.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={5}>
                      <Text c="dimmed" ta="center" py="lg">
                        {q ? `No se encontraron clientes para "${q}".` : "No hay clientes cargados. Creá el primero con \"Crear nuevo cliente\"."}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ) : items.map((c) => {
                  const doc = fmtDoc(String(c.kind ?? ""), c.dni as string | null, c.cuit as string | null);
                  const plan = String(c.plan_profile ?? "").trim();
                  const connCount = Number(c.connections_count ?? 0);
                  const phone = String(c.phone ?? "").trim();
                  const address = String(c.address ?? "").trim();
                  const meta = [
                    `#${c.id}`,
                    c.kind === "COMPANY" ? "Empresa" : "Persona",
                    doc.value !== "—" ? `${doc.label} ${doc.value}` : null,
                    phone || null,
                    address || null,
                  ].filter(Boolean).join(" · ");
                  return (
                  <Table.Tr key={Number(c.id)} style={{ cursor: "pointer" }} onClick={() => navigate(`/clients/${c.id}`)}>
                    <Table.Td>
                      <Text fw={600} size="sm" truncate>{String(c.full_name ?? "")}</Text>
                      <Text size="xs" c="dimmed" truncate>{meta}</Text>
                    </Table.Td>
                    <Table.Td>
                      {plan ? <MutedBadge tone="lilac" size="sm">{plan}</MutedBadge> : <Text size="sm" c="dimmed">—</Text>}
                      {connCount > 1 ? <Text size="xs" c="dimmed">{connCount} conex.</Text> : null}
                    </Table.Td>
                    <Table.Td>
                      <DebtAmount value={c.debt_total} />
                    </Table.Td>
                    <Table.Td>
                      <Group gap={6} wrap="nowrap">
                        {servicesBadge(c)}
                        {Number(c.open_complaints ?? 0) > 0 ? (
                          <Tooltip
                            label={
                              Number(c.open_complaints) === 1
                                ? "1 reclamo pendiente"
                                : `${Number(c.open_complaints)} reclamos pendientes`
                            }
                          >
                            <IconAlertTriangle
                              size={22}
                              stroke={1.8}
                              color="var(--mantine-color-orange-5)"
                              aria-label="Reclamos pendientes"
                            />
                          </Tooltip>
                        ) : null}
                      </Group>
                    </Table.Td>
                    <Table.Td onClick={(e) => e.stopPropagation()}>
                      <Group gap={8} wrap="nowrap">
                        <Tooltip label="Editar">
                          <ActionIcon variant="light" color="violet" size="lg" onClick={() => setEditingClientId(Number(c.id))} aria-label="Editar">
                            <IconPencil size={18} />
                          </ActionIcon>
                        </Tooltip>
                        <Menu position="bottom-end" withinPortal>
                          <Menu.Target>
                            <ActionIcon variant="subtle" color="gray" size="lg" aria-label="Más acciones"><IconDots size={18} /></ActionIcon>
                          </Menu.Target>
                          <Menu.Dropdown>
                            <Menu.Item onClick={() => navigate(`/clients/${c.id}`)}>Ver detalle</Menu.Item>
                            <Menu.Divider />
                            <Menu.Item
                              color="red"
                              onClick={() => setConfirm({
                                title: `Eliminar cliente #${c.id}`,
                                message: `Se eliminará el cliente "${String(c.full_name ?? "")}" junto con sus conexiones. Esta acción no se puede deshacer.`,
                                confirmLabel: "Eliminar",
                                danger: true,
                                onConfirm: async () => {
                                  try {
                                    await api.deleteClient(Number(c.id));
                                    if (items.length === 1 && page > 1) setPage(page - 1);
                                    else await reloadList();
                                  } catch (e: unknown) {
                                    setError(formatApiError(e));
                                  }
                                },
                              })}
                            >
                              Eliminar cliente
                            </Menu.Item>
                          </Menu.Dropdown>
                        </Menu>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      ) : null}
    </Stack>
  );
}

function initials(name?: string | null): string {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function fmtDoc(kind: string | undefined, dni?: string | null, cuit?: string | null): { label: string; value: string } {
  if (kind === "COMPANY") {
    const d = String(cuit ?? "").replace(/\D/g, "");
    const value = d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : (cuit?.trim() || "—");
    return { label: "CUIT", value };
  }
  const d = String(dni ?? "").replace(/\D/g, "");
  let value = dni?.trim() || "—";
  if (d.length === 8) value = `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  else if (d.length === 7) value = `${d.slice(0, 1)}.${d.slice(1, 4)}.${d.slice(4)}`;
  return { label: "DNI", value };
}

function displayOrDash(value?: string | null): string {
  const s = String(value ?? "").trim();
  return s || "—";
}

function DebtAmount(props: { value: unknown }) {
  const n = Number(props.value ?? 0);
  if (!Number.isFinite(n) || n <= 0) {
    return <Text size="sm" c="dimmed">Al día</Text>;
  }
  return (
    <Text size="sm" fw={600}>
      {fmtMoney(n)}
    </Text>
  );
}

function whatsappHref(phone?: string | null): string | null {
  let digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (!digits.startsWith("54")) digits = `54${digits}`;
  if (digits.startsWith("54") && !digits.startsWith("549")) digits = `549${digits.slice(2)}`;
  return `https://web.whatsapp.com/send?phone=${digits}`;
}

function mapsHref(url?: string | null, lat?: number | null, lng?: number | null): string | null {
  if (url && /^https?:\/\//i.test(url)) return url;
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }
  return null;
}

function MetaField(props: { label: string; value: string; href?: string; onClick?: () => void }) {
  const empty = props.value === "—";
  const valueNode = props.href && !empty ? (
    <Anchor
      href={props.href}
      size="md"
      underline="never"
      c="inherit"
      target={props.href.startsWith("http") ? "_blank" : undefined}
      rel={props.href.startsWith("http") ? "noreferrer" : undefined}
    >
      {props.value}
    </Anchor>
  ) : (
    <Text size="md" c={empty ? "dimmed" : props.onClick ? "violet" : undefined}>
      {props.value}
    </Text>
  );
  return (
    <Stack gap={4}>
      <Text size="sm" c="dimmed" fw={500}>
        {props.label}
      </Text>
      {props.onClick && !empty ? (
        <UnstyledButton onClick={props.onClick} style={{ textAlign: "left" }}>
          {valueNode}
        </UnstyledButton>
      ) : (
        valueNode
      )}
    </Stack>
  );
}

function QuietTh(props: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <Table.Th style={{ textAlign: props.align }}>
      <Text size="sm" c="dimmed" fw={500} tt="none">
        {props.children}
      </Text>
    </Table.Th>
  );
}

type DetailTab = "connections" | "billing" | "complaints";

function ClientDetail(props: { clientId: number; onBack: () => void; onEdit: () => void; servers: { id: number; name: string; host: string; port: number }[]; planOptions: string[] }) {
  const [client, setClient] = useState<ClientDetailData | null>(null);
  const [invoices, setInvoices] = useState<Record<string, unknown>[]>([]);
  const [complaints, setComplaints] = useState<Record<string, unknown>[]>([]);
  const [detailLoading, setDetailLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const [showNewComplaint, setShowNewComplaint] = useState(false);
  const [showNewConnection, setShowNewConnection] = useState(false);
  const [paying, setPaying] = useState<unknown>(null);
  const [connDetails, setConnDetails] = useState<ConnectionDetailsData | null>(null);
  const [editingConn, setEditingConn] = useState<unknown>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") as DetailTab | null;
  const tab: DetailTab = tabParam === "billing" || tabParam === "complaints" ? tabParam : "connections";
  const setTab = (t: DetailTab) => {
    const p = new URLSearchParams(searchParams);
    if (t === "connections") p.delete("tab");
    else p.set("tab", t);
    setSearchParams(p, { replace: true });
  };
  const [sendingEmail, setSendingEmail] = useState<number | null>(null);
  const [issuingId, setIssuingId] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  function openPdf(id: number) {
    const url = api.getInvoicePdfUrl(id);
    window.open(url, "_blank");
  }

  async function issueDraft(id: number) {
    setError(null);
    setIssuingId(id);
    try {
      await api.issueInvoice(id);
      notifySuccess("Factura emitida.");
      await reloadDetail();
    } catch (e: unknown) {
      setError(formatApiError(e));
    } finally {
      setIssuingId(null);
    }
  }

  async function sendEmail(id: number) {
    setError(null);
    setSendingEmail(id);
    try {
      const res = (await api.sendInvoiceEmail(id)) as { ok: boolean; to: string; message: string };
      notifySuccess(res.message || `Enviada a ${res.to}`, "Email enviado");
    } catch (e: unknown) {
      setError(`Error enviando email: ${formatApiError(e)}`);
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
      setError(formatApiError(e));
    }
    try {
      const inv = await api.listInvoices(props.clientId);
      setInvoices(Array.isArray(inv) ? inv : []);
    } catch (e: unknown) {
      setError(formatApiError(e));
    }
    try {
      const items = await api.listComplaints(props.clientId);
      setComplaints(Array.isArray(items) ? items : []);
    } catch (e: unknown) {
      setError(formatApiError(e));
    }
    setDetailLoading(false);
  }

  useEffect(() => { setDetailLoading(true); reloadDetail(); }, [props.clientId]);

  async function doCutRestore(conn: { id: number; status?: string }) {
    setError(null);
    try {
      if (conn.status === "CUT") {
        await api.restoreConnection(conn.id);
        notifySuccess(`Conexión #${conn.id} restaurada.`);
      } else {
        await api.cutConnection(conn.id, "suspended");
        notifySuccess(`Conexión #${conn.id} cortada.`);
      }
      await reloadDetail();
    } catch (e: unknown) {
      setError(formatApiError(e));
    }
  }

  function cutRestore(conn: { id: number; status?: string; pppoe_name?: string }) {
    if (conn.status === "CUT") {
      // Restaurar no es destructivo: se ejecuta directo.
      doCutRestore(conn);
      return;
    }
    setConfirm({
      title: `Cortar conexión #${conn.id}`,
      message: `El servicio${conn.pppoe_name ? ` "${conn.pppoe_name}"` : ""} quedará suspendido en el Mikrotik y el cliente se quedará sin internet. Se puede restaurar en cualquier momento.`,
      confirmLabel: "Cortar servicio",
      danger: true,
      onConfirm: () => doCutRestore(conn),
    });
  }

  function deleteInvoice(id: number) {
    setConfirm({
      title: `Eliminar factura #${id}`,
      message: "La factura se dará de baja (baja lógica). Solo es posible si no tiene pagos registrados.",
      confirmLabel: "Eliminar factura",
      danger: true,
      onConfirm: async () => {
        setError(null);
        try {
          await api.deleteInvoice(id);
          setPaying(null);
          notifySuccess(`Factura #${id} eliminada.`);
          await reloadDetail();
        } catch (e: unknown) {
          setError(formatApiError(e));
        }
      },
    });
  }

  function suspendAllServices() {
    setConfirm({
      title: "Suspender todos los servicios",
      message: "Se cortarán TODAS las conexiones del cliente. Los servicios se pueden restaurar luego uno por uno.",
      confirmLabel: "Suspender todo",
      danger: true,
      onConfirm: async () => {
        setError(null);
        try {
          await api.suspendClientServices(props.clientId, "suspended");
          notifySuccess("Todos los servicios del cliente fueron suspendidos.");
          await reloadDetail();
        } catch (e: unknown) {
          setError(formatApiError(e));
        }
      },
    });
  }

  const connections = (client?.connections ?? []) as { id: number; pppoe_name?: string; server_name?: string; ip?: string; plan_profile?: string; service_address?: string; status?: string }[];
  const doc = fmtDoc(client?.kind, client?.dni, client?.cuit);

  // Deuda: solo facturas emitidas impagas. Un borrador no es saldo.
  const debt = invoices.reduce((acc, x) => {
    const st = String(x.status ?? "").toUpperCase();
    const pay = String(x.payment_status ?? "").toUpperCase();
    if (st !== "ISSUED" || pay === "PAID") return acc;
    const rem = Number(x.total ?? 0) - Number(x.paid_total ?? 0);
    return acc + Math.max(0, rem);
  }, 0);
  const unpaidCount = invoices.filter((x) => {
    const st = String(x.status ?? "").toUpperCase();
    const pay = String(x.payment_status ?? "").toUpperCase();
    return st === "ISSUED" && pay !== "PAID";
  }).length;
  const openComplaints = complaints.filter((x) => {
    const st = String(x.status ?? "").toUpperCase();
    return st !== "SOLVED";
  }).length;
  const locLat = client?.latitude != null ? Number(client.latitude) : NaN;
  const locLng = client?.longitude != null ? Number(client.longitude) : NaN;
  const hasCoords = Number.isFinite(locLat) && Number.isFinite(locLng);
  const locationHref = mapsHref(client?.location_url, hasCoords ? locLat : null, hasCoords ? locLng : null);
  const locationLabel = client?.address?.trim() || (hasCoords ? "Ver mapa" : "");
  const activeCount = connections.filter((c) => c.status !== "CUT").length;
  const serviceState = !connections.length
    ? { label: "Sin servicios", color: "gray" }
    : activeCount === 0
      ? { label: "Suspendido", color: "red" }
      : activeCount < connections.length
        ? { label: "Parcial", color: "yellow" }
        : { label: "Activo", color: "green" };

  return (
    <Stack gap="md">
      <InvoiceModal open={showNewInvoice} client={client ?? undefined} connections={client?.connections ?? []} onClose={() => setShowNewInvoice(false)} onSaved={async () => { setShowNewInvoice(false); notifySuccess("Factura creada."); await reloadDetail(); }} />
      <Modal opened={showLocation} onClose={() => setShowLocation(false)} title="Ubicación" size="lg">
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <Paper p="sm" radius="md" style={{ background: "rgba(122, 79, 176, 0.12)" }}>
              <Text size="sm" c="dimmed" fw={500} mb={6}>Dirección</Text>
              <Group gap={8} wrap="nowrap" align="flex-start">
                <IconMapPin size={18} stroke={1.7} color="var(--mantine-color-violet-6)" style={{ flexShrink: 0, marginTop: 2 }} />
                <Text size="md">{displayOrDash(client?.address)}</Text>
              </Group>
            </Paper>
            <Paper
              p="sm"
              radius="md"
              component={client?.phone && whatsappHref(client.phone) ? "a" : "div"}
              href={client?.phone ? whatsappHref(client.phone) ?? undefined : undefined}
              target="_blank"
              rel="noreferrer"
              style={{
                background: "rgba(37, 211, 102, 0.12)",
                textDecoration: "none",
                color: "inherit",
                cursor: client?.phone && whatsappHref(client.phone) ? "pointer" : "default",
              }}
            >
              <Text size="sm" c="dimmed" fw={500} mb={6}>Teléfono</Text>
              <Group gap={8} wrap="nowrap">
                <IconBrandWhatsapp size={18} stroke={1.6} color="#25D366" style={{ flexShrink: 0 }} />
                <Text size="md" c={client?.phone ? undefined : "dimmed"}>
                  {displayOrDash(client?.phone)}
                </Text>
              </Group>
            </Paper>
          </SimpleGrid>
          {hasCoords ? (
            <CoverageMap
              client={{ lat: locLat, lng: locLng }}
              clientLabel={String(client?.full_name ?? "Cliente")}
              nap={null}
              height={280}
            />
          ) : (
            <Text size="sm" c="dimmed">No hay coordenadas cargadas para este cliente.</Text>
          )}
          {locationHref ? (
            <UnstyledButton
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(locationHref);
                  notifySuccess("Enlace copiado.");
                } catch {
                  notifyError("No se pudo copiar el enlace.");
                }
              }}
            >
              <Text size="md" c="dimmed">Copiar enlace</Text>
            </UnstyledButton>
          ) : null}
        </Stack>
      </Modal>
      <ComplaintModal open={showNewComplaint} client={client} connections={client?.connections ?? []} onClose={() => setShowNewComplaint(false)} onSaved={async () => { setShowNewComplaint(false); notifySuccess("Reclamo registrado."); await reloadDetail(); }} />
      <PaymentModal
        open={!!paying}
        invoice={paying}
        client={client}
        onClose={() => setPaying(null)}
        onSaved={async () => { setPaying(null); notifySuccess("Pago registrado correctamente."); await reloadDetail(); }}
      />
      <ConnectionDetailsModal open={!!connDetails} connection={connDetails} onClose={() => setConnDetails(null)} onSaved={async () => { setConnDetails(null); await reloadDetail(); }} />
      <ConnectionCreateModal open={showNewConnection} clientId={props.clientId} servers={props.servers} planOptions={props.planOptions} onClose={() => setShowNewConnection(false)} onSaved={async () => { setShowNewConnection(false); notifySuccess("Conexión creada."); await reloadDetail(); }} />
      <ConnectionEditModal open={!!editingConn} connection={editingConn as { id: number } | null} servers={props.servers} planOptions={props.planOptions} onClose={() => setEditingConn(null)} onSaved={async () => { setEditingConn(null); await reloadDetail(); }} />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Card>
          {error ? <Alert color="red" title="Error" withCloseButton onClose={() => setError(null)}>{error}</Alert> : null}
          {detailLoading && !client ? (
            <Stack gap="lg">
              <Group>
                <Skeleton height={44} circle />
                <div style={{ flex: 1 }}>
                  <Skeleton height={22} width="40%" mb={8} />
                  <Skeleton height={12} width="25%" />
                </div>
              </Group>
              <SimpleGrid cols={2} maw={560}>
                <Skeleton height={32} />
                <Skeleton height={32} />
                <Skeleton height={32} />
                <Skeleton height={32} />
              </SimpleGrid>
            </Stack>
          ) : client ? (
            <Stack gap="lg">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Group gap="sm" wrap="nowrap" align="flex-start" style={{ minWidth: 0 }}>
                  <ActionIcon variant="subtle" color="gray" size="lg" onClick={props.onBack} aria-label="Volver" mt={4}>
                    <IconArrowLeft size={18} />
                  </ActionIcon>
                  <Avatar
                    size={52}
                    radius="xl"
                    color={["violet", "grape", "indigo", "pink", "teal", "gray"][props.clientId % 6]}
                    variant="light"
                  >
                    {initials(client.full_name)}
                  </Avatar>
                  <div style={{ minWidth: 0 }}>
                    <Text fw={600} fz={22} lh={1.2} truncate>
                      {String(client.full_name)}
                    </Text>
                    <Group gap={6} mt={6} wrap="wrap">
                      <Text size="md" c="dimmed">{client.kind === "COMPANY" ? "Empresa" : "Persona"}</Text>
                      <Text size="md" c="dimmed">·</Text>
                      <Group gap={6} wrap="nowrap">
                        <Box
                          w={8}
                          h={8}
                          bg={serviceState.color}
                          style={{ borderRadius: "50%", flexShrink: 0 }}
                        />
                        <Text size="md" c="dimmed">{serviceState.label}</Text>
                      </Group>
                    </Group>
                  </div>
                </Group>
                <Group gap="xs" wrap="nowrap">
                  <Button variant="default" onClick={props.onEdit}>Editar</Button>
                  <Menu position="bottom-end" withinPortal>
                    <Menu.Target>
                      <ActionIcon variant="subtle" color="gray" size="lg" aria-label="Más acciones"><IconDots size={18} /></ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item onClick={reloadDetail}>Recargar</Menu.Item>
                      <Menu.Divider />
                      <Menu.Item color="red" onClick={suspendAllServices}>Suspender todos los servicios</Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </Group>
              </Group>

              <SimpleGrid cols={{ base: 1, xs: 2, sm: 4 }} spacing="md">
                <MetaField label={doc.label} value={doc.value} />
                <MetaField
                  label="Teléfono"
                  value={displayOrDash(client.phone)}
                  href={whatsappHref(client.phone) ?? undefined}
                />
                <MetaField
                  label="Email"
                  value={displayOrDash(client.email)}
                  href={client.email ? `mailto:${String(client.email)}` : undefined}
                />
                <MetaField
                  label="Ubicación"
                  value={displayOrDash(locationLabel)}
                  onClick={locationLabel ? () => setShowLocation(true) : undefined}
                />
              </SimpleGrid>

              <Divider />

              <Group justify="space-between" align="center" wrap="wrap" gap="sm">
                <div>
                  <Text size="md" c="dimmed" fw={500}>
                    {debt > 0 ? "Pendiente de cobro" : "Cuenta al día"}
                  </Text>
                  <Text size="xl" fw={600} lh={1.25} mt={2}>
                    {fmtMoney(debt)}
                  </Text>
                </div>
                <Group gap={28} wrap="wrap" justify="center" style={{ flex: 1 }}>
                  {connections.length > 0 ? (
                    <UnstyledButton onClick={() => setTab("connections")}>
                      <MutedBadge size="lg" tone="gray" style={{ cursor: "pointer", paddingLeft: 16, paddingRight: 16 }}>
                        {connections.length} {connections.length === 1 ? "conexión" : "conexiones"}
                      </MutedBadge>
                    </UnstyledButton>
                  ) : null}
                  {unpaidCount > 0 ? (
                    <UnstyledButton onClick={() => setTab("billing")}>
                      <MutedBadge size="lg" tone="yellow" style={{ cursor: "pointer", paddingLeft: 16, paddingRight: 16 }}>
                        {unpaidCount === 1 ? "1 factura pendiente" : `${unpaidCount} facturas pendientes`}
                      </MutedBadge>
                    </UnstyledButton>
                  ) : null}
                  {openComplaints > 0 ? (
                    <UnstyledButton onClick={() => setTab("complaints")}>
                      <MutedBadge
                        size="lg"
                        tone="orange"
                        leftSection={<IconAlertTriangle size={16} stroke={1.8} />}
                        style={{ cursor: "pointer", paddingLeft: 16, paddingRight: 16 }}
                      >
                        {openComplaints === 1 ? "1 reclamo pendiente" : `${openComplaints} reclamos pendientes`}
                      </MutedBadge>
                    </UnstyledButton>
                  ) : null}
                </Group>
              </Group>
            </Stack>
          ) : (
            <Text c="dimmed">No se pudo cargar el cliente.</Text>
          )}
        </Card>

        <Card>
          <Tabs value={tab} onChange={(v) => v && setTab(v as "connections" | "billing" | "complaints")}>
            <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
              <Tabs.List style={{ flex: 1, minWidth: 240, fontSize: 16 }}>
                <Tabs.Tab value="connections">Conexiones</Tabs.Tab>
                <Tabs.Tab value="billing">Facturación</Tabs.Tab>
                <Tabs.Tab value="complaints">Reclamos</Tabs.Tab>
              </Tabs.List>
              {tab === "connections" ? (
                <Button variant="primaryLight" onClick={() => setShowNewConnection(true)}>Nueva conexión</Button>
              ) : null}
              {tab === "billing" ? (
                <Button variant="primaryLight" onClick={() => setShowNewInvoice(true)}>Nueva factura</Button>
              ) : null}
              {tab === "complaints" ? (
                <Button variant="primaryLight" onClick={() => setShowNewComplaint(true)}>Nuevo reclamo</Button>
              ) : null}
            </Group>
            <Tabs.Panel value="connections" pt="md">
              <Table.ScrollContainer minWidth={700}>
                <Table highlightOnHover verticalSpacing="sm" fz="md">
                  <Table.Thead>
                    <Table.Tr>
                      <QuietTh>ID</QuietTh>
                      <QuietTh>PPPoE</QuietTh>
                      <QuietTh>Servidor</QuietTh>
                      <QuietTh>IP</QuietTh>
                      <QuietTh>Plan</QuietTh>
                      <QuietTh>Domicilio</QuietTh>
                      <QuietTh>Estado</QuietTh>
                      <QuietTh>Acciones</QuietTh>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {connections.map((conn) => (
                      <Table.Tr
                        key={conn.id}
                        style={{ cursor: "pointer" }}
                        onClick={() => setConnDetails(conn)}
                      >
                        <Table.Td>{conn.id}</Table.Td>
                        <Table.Td>{conn.pppoe_name}</Table.Td>
                        <Table.Td>{conn.server_name ?? "-"}</Table.Td>
                        <Table.Td onClick={(e) => e.stopPropagation()}>
                          {conn.ip ? (
                            <Anchor href={`http://${String(conn.ip).trim()}`} target="_blank" rel="noopener noreferrer">
                              <MutedBadge size="lg" tone="gray" style={{ cursor: "pointer" }}>
                                {conn.ip}
                              </MutedBadge>
                            </Anchor>
                          ) : (
                            <Text size="sm" c="dimmed">—</Text>
                          )}
                        </Table.Td>
                        <Table.Td>
                          {conn.plan_profile ? (
                            <MutedBadge size="lg" tone="lilac">
                              {conn.plan_profile}
                            </MutedBadge>
                          ) : (
                            <Text size="sm" c="dimmed">—</Text>
                          )}
                        </Table.Td>
                        <Table.Td>{conn.service_address ?? "-"}</Table.Td>
                        <Table.Td>
                          <MutedBadge size="lg" tone={connectionStatusTone(conn.status)}>
                            {connectionStatusLabel(conn.status)}
                          </MutedBadge>
                        </Table.Td>
                        <Table.Td onClick={(e) => e.stopPropagation()}>
                          <Group gap={8} wrap="nowrap">
                            <Tooltip label="Editar">
                              <ActionIcon size="lg" variant="light" color="violet" onClick={() => setEditingConn(conn)} aria-label="Editar">
                                <IconPencil size={20} />
                              </ActionIcon>
                            </Tooltip>
                            {conn.status === "CUT" ? (
                              <Tooltip label="Restaurar">
                                <ActionIcon size="lg" variant="filled" color="teal" onClick={() => cutRestore(conn)} aria-label="Restaurar">
                                  <IconRestore size={20} />
                                </ActionIcon>
                              </Tooltip>
                            ) : (
                              <Tooltip label="Cortar">
                                <ActionIcon
                                  size="lg"
                                  variant="filled"
                                  onClick={() => cutRestore(conn)}
                                  aria-label="Cortar"
                                  style={MUTED_DISCONNECT_STYLE}
                                >
                                  <IconPlugConnectedX size={20} />
                                </ActionIcon>
                              </Tooltip>
                            )}
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
              {!connections.length ? <Text c="dimmed">Sin conexiones. Agregá una con "Nueva conexión".</Text> : null}
            </Tabs.Panel>
            <Tabs.Panel value="billing" pt="md">
              <Table.ScrollContainer minWidth={700}>
                <Table striped highlightOnHover verticalSpacing="sm" fz="md">
                  <Table.Thead>
                    <Table.Tr>
                      <QuietTh>ID</QuietTh>
                      <QuietTh>Tipo</QuietTh>
                      <QuietTh>Concepto</QuietTh>
                      <QuietTh>Fecha</QuietTh>
                      <QuietTh>Vence</QuietTh>
                      <QuietTh>Estado</QuietTh>
                      <QuietTh>Total</QuietTh>
                      <QuietTh>Pagado</QuietTh>
                      <QuietTh>Acciones</QuietTh>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {invoices.map((x) => (
                      <Table.Tr key={Number(x.id)}>
                        <Table.Td>{String(x.id)}</Table.Td>
                        <Table.Td><MutedBadge tone="gray" size="md">{String(x.invoice_type ?? "-")}</MutedBadge></Table.Td>
                        <Table.Td style={{ maxWidth: 180 }}>
                          <Text size="sm" truncate>{String(x.description || "Servicio")}</Text>
                        </Table.Td>
                        <Table.Td>{fmtDate(String(x.issue_date ?? "")) || "-"}</Table.Td>
                        <Table.Td>{fmtDate(String(x.due_date ?? "")) || "-"}</Table.Td>
                        <Table.Td>
                          <InvoiceStatusBadge status={String(x.payment_status ?? x.status ?? "")} />
                        </Table.Td>
                        <Table.Td fw={600}>{fmtMoney(x.total)}</Table.Td>
                        <Table.Td>{fmtMoney(x.paid_total ?? 0)}</Table.Td>
                        <Table.Td>
                          <Group gap={4} wrap="nowrap">
                            {String(x.status).toUpperCase() === "DRAFT" ? (
                              <Tooltip label="Emitir">
                                <ActionIcon
                                  variant="light"
                                  color="orange"
                                  loading={issuingId === Number(x.id)}
                                  onClick={() => issueDraft(Number(x.id))}
                                  aria-label="Emitir"
                                >
                                  <IconFileCheck size={16} />
                                </ActionIcon>
                              </Tooltip>
                            ) : null}
                            <Tooltip label="Ver PDF">
                              <ActionIcon variant="light" color="violet" onClick={() => openPdf(Number(x.id))} aria-label="Ver PDF">
                                <IconFileTypePdf size={16} />
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label="Enviar por email">
                              <ActionIcon
                                variant="light"
                                color="teal"
                                loading={sendingEmail === Number(x.id)}
                                onClick={() => sendEmail(Number(x.id))}
                                aria-label="Enviar por email"
                              >
                                <IconMail size={16} />
                              </ActionIcon>
                            </Tooltip>
                            {(x.status === "ISSUED" || x.status === "DRAFT") ? (
                              <Tooltip label="Registrar pago">
                                <ActionIcon variant="light" color="green" onClick={() => setPaying(x)} aria-label="Registrar pago">
                                  <IconCash size={16} />
                                </ActionIcon>
                              </Tooltip>
                            ) : null}
                            <Tooltip label="Eliminar">
                              <ActionIcon variant="light" color="red" onClick={() => deleteInvoice(Number(x.id))} aria-label="Eliminar">
                                <IconTrash size={16} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
              {!invoices.length ? <Text c="dimmed">Sin facturas.</Text> : null}
            </Tabs.Panel>
            <Tabs.Panel value="complaints" pt="md">
              <Table.ScrollContainer minWidth={700}>
                <Table highlightOnHover verticalSpacing="sm" fz="md">
                  <Table.Thead>
                    <Table.Tr>
                      <QuietTh>ID</QuietTh>
                      <QuietTh>Fecha</QuietTh>
                      <QuietTh>Tipo</QuietTh>
                      <QuietTh>Conexión</QuietTh>
                      <QuietTh>Detalle</QuietTh>
                      <QuietTh>Estado</QuietTh>
                      <QuietTh>Solución</QuietTh>
                      <QuietTh>Tiempo</QuietTh>
                      <QuietTh>Acciones</QuietTh>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {complaints.map((x) => (
                      <Table.Tr key={Number(x.id)}>
                        <Table.Td>{String(x.id)}</Table.Td>
                        <Table.Td>{fmtDate(String(x.created_at ?? "")) || "-"}</Table.Td>
                        <Table.Td>
                          <MutedBadge size="lg" tone="gray">
                            {x.kind === "BILLING" ? "Facturación" : "Técnico"}
                          </MutedBadge>
                        </Table.Td>
                        <Table.Td>{String(x.connection_id ?? "-")}</Table.Td>
                        <Table.Td style={{ maxWidth: 420, whiteSpace: "pre-wrap" }}>{String(x.detail ?? "")}</Table.Td>
                        <Table.Td>
                          <MutedBadge size="lg" tone={complaintStatusTone(String(x.status))}>
                            {complaintStatusLabel(String(x.status))}
                          </MutedBadge>
                        </Table.Td>
                        <Table.Td>{x.solved_at ? fmtDate(String(x.solved_at)) : "-"}</Table.Td>
                        <Table.Td>{String(x.solved_human ?? "-")}</Table.Td>
                        <Table.Td>
                          <Select
                            value={String(x.status)}
                            disabled={x.status === "SOLVED"}
                            data={[{ value: "TODO", label: "Pendiente" }, { value: "WIP", label: "En curso" }, { value: "SOLVED", label: "Resuelto" }]}
                            onChange={async (v) => {
                              if (!v) return;
                              try {
                                await api.updateComplaint(Number(x.id), { status: v.toUpperCase() });
                                await reloadDetail();
                              } catch (err: unknown) {
                                setError(formatApiError(err));
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
