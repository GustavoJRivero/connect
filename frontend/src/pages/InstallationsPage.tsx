import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { Button, Card, MutedBadge, installationStatusTone } from "../ui";
import { ConfirmDialog, ConfirmState } from "../components/ConfirmDialog";
import { formatApiError } from "../format";
import { fmtDateTime } from "../datetime";
import { notifyError, notifySuccess } from "../notify";
import { CoverageMap } from "../components/CoverageMap";
import {
  Alert,
  Anchor,
  Group,
  Modal,
  Pagination,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Tooltip,
  ActionIcon,
  UnstyledButton,
} from "@mantine/core";
import {
  IconBrandWhatsapp,
  IconCheck,
  IconFileTypePdf,
  IconMapPin,
  IconPencil,
  IconRefresh,
  IconX,
} from "@tabler/icons-react";

type OrderRow = {
  id: number;
  created_at?: string;
  client_id: number;
  client_name?: string;
  client_phone?: string;
  connection_id?: number;
  plan_profile?: string;
  service_address?: string;
  location_url?: string;
  latitude?: string | number | null;
  longitude?: string | number | null;
  status: string;
  nap_ref?: string;
  nap_name?: string;
  fiber_meters?: string;
  reserved_at?: string;
  expires_at?: string;
  confirmed_at?: string;
  last_maps_error?: string;
  technician?: string;
  notes?: string;
};

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "RESERVADO", label: "Reservadas" },
  { value: "SIN_COBERTURA", label: "Sin cobertura" },
  { value: "PENDIENTE", label: "Pendientes" },
  { value: "VENCIDA", label: "Vencidas" },
  { value: "INSTALADA", label: "Instaladas" },
  { value: "CANCELADA", label: "Canceladas" },
];

function statusBadge(status: string) {
  const t = STATUS_TABS.find((x) => x.value === status);
  return <MutedBadge tone={installationStatusTone(status)}>{t?.label ?? status}</MutedBadge>;
}

function fmtExpiry(iso?: string) {
  if (!iso) return "-";
  return fmtDateTime(iso) || iso;
}

function orderCoords(o: OrderRow): { lat: number; lng: number } | null {
  const lat = Number(o.latitude);
  const lng = Number(o.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  const m = String(o.location_url ?? "").match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return Number.isFinite(a) && Number.isFinite(b) ? { lat: a, lng: b } : null;
}

function mapsHref(url?: string | null, coords?: { lat: number; lng: number } | null): string | null {
  if (url && /^https?:\/\//i.test(url)) return url;
  if (coords) return `https://www.google.com/maps?q=${coords.lat},${coords.lng}`;
  return null;
}

function whatsappHref(phone?: string | null): string | null {
  let digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (!digits.startsWith("54")) digits = `54${digits}`;
  if (digits.startsWith("54") && !digits.startsWith("549")) digits = `549${digits.slice(2)}`;
  return `https://web.whatsapp.com/send?phone=${digits}`;
}

export default function InstallationsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // La solapa activa vive en la URL (?tab=...) para poder compartir el link.
  const tabParam = searchParams.get("tab");
  const tab = STATUS_TABS.some((t) => t.value === tabParam) ? (tabParam as string) : "RESERVADO";
  const setTab = (t: string) => {
    const p = new URLSearchParams(searchParams);
    if (t === "RESERVADO") p.delete("tab");
    else p.set("tab", t);
    setSearchParams(p, { replace: true });
  };
  const [items, setItems] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<OrderRow | null>(null);
  const [editTech, setEditTech] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [viewingLocation, setViewingLocation] = useState<OrderRow | null>(null);

  const pageSize = 25;

  const reload = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [res, sum] = await Promise.all([
        api.listInstallations({ status: tab, limit: pageSize, offset: (page - 1) * pageSize }) as Promise<{ items?: OrderRow[]; total?: number }>,
        api.getInstallationsSummary() as Promise<Record<string, number>>,
      ]);
      setItems(res?.items ?? []);
      setTotal(Number(res?.total ?? 0));
      setSummary(sum ?? {});
    } catch (e: unknown) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, [tab, page]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function doAction(fn: () => Promise<unknown>, okMsg: string) {
    setError(null);
    try {
      await fn();
      notifySuccess(okMsg);
      await reload();
    } catch (e: unknown) {
      setError(formatApiError(e));
    }
  }

  function openEdit(o: OrderRow) {
    setEditing(o);
    setEditTech(o.technician ?? "");
    setEditNotes(o.notes ?? "");
  }

  async function saveEdit() {
    if (!editing || savingEdit) return;
    setSavingEdit(true);
    try {
      await doAction(
        () => api.updateInstallation(editing.id, { technician: editTech, notes: editNotes }),
        `Orden #${editing.id} actualizada.`,
      );
      setEditing(null);
    } finally {
      setSavingEdit(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const locCoords = viewingLocation ? orderCoords(viewingLocation) : null;
  const locHref = viewingLocation ? mapsHref(viewingLocation.location_url, locCoords) : null;
  const locWa = viewingLocation ? whatsappHref(viewingLocation.client_phone) : null;

  return (
    <Stack gap="md">
      <Modal opened={viewingLocation != null} onClose={() => setViewingLocation(null)} title="Ubicación" size="lg">
        {viewingLocation ? (
          <Stack gap="md">
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <Paper p="sm" radius="md" style={{ background: "rgba(122, 79, 176, 0.12)" }}>
                <Text size="sm" c="dimmed" fw={500} mb={6}>Dirección</Text>
                <Group gap={8} wrap="nowrap" align="flex-start">
                  <IconMapPin size={18} stroke={1.7} color="var(--mantine-color-violet-6)" style={{ flexShrink: 0, marginTop: 2 }} />
                  <Text size="md">{viewingLocation.service_address?.trim() || "—"}</Text>
                </Group>
              </Paper>
              <Paper
                p="sm"
                radius="md"
                component={locWa ? "a" : "div"}
                href={locWa ?? undefined}
                target="_blank"
                rel="noreferrer"
                style={{
                  background: "rgba(37, 211, 102, 0.12)",
                  textDecoration: "none",
                  color: "inherit",
                  cursor: locWa ? "pointer" : "default",
                }}
              >
                <Text size="sm" c="dimmed" fw={500} mb={6}>Teléfono</Text>
                <Group gap={8} wrap="nowrap">
                  <IconBrandWhatsapp size={18} stroke={1.6} color="#25D366" style={{ flexShrink: 0 }} />
                  <Text size="md" c={viewingLocation.client_phone ? undefined : "dimmed"}>
                    {viewingLocation.client_phone?.trim() || "—"}
                  </Text>
                </Group>
              </Paper>
            </SimpleGrid>
            {locCoords ? (
              <CoverageMap
                client={locCoords}
                clientLabel={viewingLocation.client_name ?? `Orden #${viewingLocation.id}`}
                nap={null}
                height={280}
              />
            ) : (
              <Text size="sm" c="dimmed">No hay coordenadas cargadas para esta orden.</Text>
            )}
            {locHref ? (
              <UnstyledButton
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(locHref);
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
        ) : null}
      </Modal>
      <Modal opened={editing != null} onClose={() => setEditing(null)} title={`Orden #${editing?.id} — técnico y notas`}>
        <Stack>
          <TextInput label="Técnico asignado" value={editTech} onChange={(e) => setEditTech(e.currentTarget.value)} />
          <Textarea label="Notas" value={editNotes} onChange={(e) => setEditNotes(e.currentTarget.value)} minRows={3} />
          <Group justify="flex-end">
            <Button variant="default" disabled={savingEdit} onClick={() => setEditing(null)}>Cancelar</Button>
            <Button variant="primary" loading={savingEdit} onClick={saveEdit}>Guardar</Button>
          </Group>
        </Stack>
      </Modal>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />

      <Card title="Órdenes de instalación">
        {error ? <Alert color="red" title="Error" withCloseButton onClose={() => setError(null)} mb="sm">{error}</Alert> : null}

        <Tabs value={tab} onChange={(v) => { if (v) { setTab(v); setPage(1); } }}>
          <Tabs.List>
            {STATUS_TABS.map((t) => (
              <Tabs.Tab key={t.value} value={t.value}>
                {t.label} {summary[t.value] ? <MutedBadge size="sm" tone={installationStatusTone(t.value)} ml={4}>{summary[t.value]}</MutedBadge> : null}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>

        <Table.ScrollContainer minWidth={1000} mt="md">
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>#</Table.Th>
                <Table.Th>Cliente</Table.Th>
                <Table.Th>Plan</Table.Th>
                <Table.Th>Ubicación</Table.Th>
                <Table.Th>NAP</Table.Th>
                <Table.Th>Fibra</Table.Th>
                <Table.Th>Vence</Table.Th>
                <Table.Th>Estado</Table.Th>
                <Table.Th>Acciones</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Table.Tr key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <Table.Td key={j}><Skeleton height={20} width="75%" /></Table.Td>
                    ))}
                  </Table.Tr>
                ))
              ) : items.length === 0 ? (
                <Table.Tr><Table.Td colSpan={9}><Text c="dimmed" ta="center" py="lg">Sin órdenes en este estado.</Text></Table.Td></Table.Tr>
              ) : items.map((o) => (
                <Table.Tr key={o.id}>
                  <Table.Td>#{o.id}</Table.Td>
                  <Table.Td>
                    <Anchor onClick={() => navigate(`/clients/${o.client_id}`)}>{o.client_name ?? `#${o.client_id}`}</Anchor>
                    {o.client_phone ? <Text size="xs" c="dimmed">{o.client_phone}</Text> : null}
                  </Table.Td>
                  <Table.Td>{o.plan_profile ? <MutedBadge tone="lilac" size="sm">{o.plan_profile}</MutedBadge> : "-"}</Table.Td>
                  <Table.Td>
                    {o.location_url || orderCoords(o) ? (
                      <Anchor component="button" type="button" onClick={() => setViewingLocation(o)}>
                        {(() => {
                          const label = o.service_address?.trim() || o.location_url || "Ver mapa";
                          return label.length > 32 ? `${label.slice(0, 32)}…` : label;
                        })()}
                      </Anchor>
                    ) : (
                      o.service_address || "-"
                    )}
                  </Table.Td>
                  <Table.Td>{o.nap_name ?? o.nap_ref ?? "-"}</Table.Td>
                  <Table.Td>{o.fiber_meters ? `${o.fiber_meters} m` : "-"}</Table.Td>
                  <Table.Td>{fmtExpiry(o.expires_at)}</Table.Td>
                  <Table.Td>
                    {statusBadge(o.status)}
                    {o.last_maps_error ? (
                      <Tooltip label={o.last_maps_error} multiline w={320}>
                        <MutedBadge tone="yellow" ml={4}>!</MutedBadge>
                      </Tooltip>
                    ) : null}
                  </Table.Td>
                  <Table.Td>
                    <Group gap={8} wrap="nowrap">
                      <Tooltip label="PDF">
                        <ActionIcon
                          size="lg"
                          variant="light"
                          color="violet"
                          onClick={() => window.open(api.getInstallationPdfUrl(o.id), "_blank")}
                          aria-label="PDF"
                        >
                          <IconFileTypePdf size={20} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Editar">
                        <ActionIcon size="lg" variant="light" color="violet" onClick={() => openEdit(o)} aria-label="Editar">
                          <IconPencil size={20} />
                        </ActionIcon>
                      </Tooltip>
                      {(o.status === "RESERVADO" || o.status === "PENDIENTE" || o.status === "VENCIDA") ? (
                        <Tooltip label="Confirmar">
                          <ActionIcon
                            size="lg"
                            variant="filled"
                            color="teal"
                            onClick={() => doAction(() => api.confirmInstallation(o.id), `Orden #${o.id} confirmada.`)}
                            aria-label="Confirmar"
                          >
                            <IconCheck size={20} />
                          </ActionIcon>
                        </Tooltip>
                      ) : null}
                      {(o.status === "PENDIENTE" || o.status === "SIN_COBERTURA" || o.status === "VENCIDA") ? (
                        <Tooltip label="Re-chequear">
                          <ActionIcon
                            size="lg"
                            variant="light"
                            color="violet"
                            onClick={() => doAction(() => api.retryInstallationCheck(o.id), `Chequeo reintentado para orden #${o.id}.`)}
                            aria-label="Re-chequear"
                          >
                            <IconRefresh size={20} />
                          </ActionIcon>
                        </Tooltip>
                      ) : null}
                      {o.status !== "INSTALADA" && o.status !== "CANCELADA" ? (
                        <Tooltip label="Cancelar orden">
                          <ActionIcon
                            size="lg"
                            variant="light"
                            color="red"
                            aria-label="Cancelar orden"
                            onClick={() => setConfirm({
                              title: `Cancelar orden #${o.id}`,
                              message: o.status === "RESERVADO"
                                ? "Se cancelará la orden y se liberará el puerto reservado en el NAP."
                                : "La orden quedará cancelada.",
                              confirmLabel: "Cancelar orden",
                              danger: true,
                              onConfirm: () => doAction(() => api.cancelInstallation(o.id), `Orden #${o.id} cancelada.`),
                            })}
                          >
                            <IconX size={20} />
                          </ActionIcon>
                        </Tooltip>
                      ) : null}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>

        <Group justify="space-between" mt="md">
          <Text size="sm" c="dimmed">{total} órdenes</Text>
          <Pagination total={totalPages} value={page} onChange={setPage} withEdges />
        </Group>
      </Card>
    </Stack>
  );
}
