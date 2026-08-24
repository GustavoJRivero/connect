import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Button, MutedBadge } from "../ui";
import { formatApiError, fmtMoney } from "../format";
import { IconPencil, IconRefresh, IconTrash } from "@tabler/icons-react";
import {
  Stack,
  Alert,
  Table,
  Group,
  Modal,
  TextInput,
  NumberInput,
  Switch,
  Text,
  ActionIcon,
  Tooltip,
  Card,
  Loader,
  Center,
} from "@mantine/core";

interface Plan {
  id: number;
  name: string;
  profile: string;
  download_mbps: number;
  upload_mbps: number;
  rate_limit: string;
  computed_rate_limit: string;
  price: string;
  iva_percent: string;
  price_net: string;
  price_with_iva: string;
  iva_amount: string;
  is_active: boolean;
  connections_count: number;
}

/** Vista previa alineada al backend: neto = final / (1+IVA%), IVA = final − neto. */
function netAndIvaFromGross(gross: number, ivaPct: number): { net: number; iva: number } {
  const g = Number.isFinite(gross) ? gross : 0;
  const iv = Number.isFinite(ivaPct) ? ivaPct : 0;
  if (iv <= 0) return { net: Math.round(g * 100) / 100, iva: 0 };
  const divisor = 1 + iv / 100;
  const net = Math.round((g / divisor) * 100) / 100;
  const ivaAmt = Math.round((g - net) * 100) / 100;
  return { net, iva: ivaAmt };
}

const EMPTY_FORM = {
  name: "",
  profile: "",
  download_mbps: 0,
  upload_mbps: 0,
  rate_limit: "",
  price: 0,
  iva_percent: 21,
  is_active: true,
};

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function loadPlans() {
    setError(null);
    setLoading(true);
    try {
      const res = await api.listPlans();
      setPlans(res ?? []);
    } catch (e: unknown) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPlans();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setModalOpen(true);
  }

  function openEdit(plan: Plan) {
    setEditing(plan);
    setForm({
      name: plan.name,
      profile: plan.profile,
      download_mbps: plan.download_mbps,
      upload_mbps: plan.upload_mbps,
      rate_limit: plan.rate_limit ?? "",
      price: Number(plan.price),
      iva_percent: Number(plan.iva_percent),
      is_active: plan.is_active,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await api.updatePlan(editing.id, form);
      } else {
        await api.createPlan(form);
      }
      setModalOpen(false);
      await loadPlans();
    } catch (e: unknown) {
      setError(formatApiError(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await api.deletePlan(deleteTarget.id);
      setDeleteTarget(null);
      await loadPlans();
    } catch (e: unknown) {
      setError(formatApiError(e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Stack gap="md">
      {error ? (
        <Alert color="red" title="Error" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      <Card withBorder padding="md" radius="md">
        <Group justify="flex-end" mb="sm">
          <Button variant="primaryLight" onClick={openCreate}>Nuevo plan</Button>
          <Tooltip label="Recargar">
            <ActionIcon size="lg" variant="light" color="violet" onClick={loadPlans} aria-label="Recargar">
              <IconRefresh size={20} />
            </ActionIcon>
          </Tooltip>
        </Group>

        {loading ? (
          <Center py="xl">
            <Loader size="md" />
          </Center>
        ) : plans.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">No hay planes cargados.</Text>
        ) : (
          <Table highlightOnHover verticalSpacing="xs" horizontalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Plan</Table.Th>
                <Table.Th>Velocidad</Table.Th>
                <Table.Th ta="right">Precio</Table.Th>
                <Table.Th>Estado</Table.Th>
                <Table.Th ta="center">Conex.</Table.Th>
                <Table.Th>Acciones</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {plans.map((plan) => (
                <Table.Tr key={plan.id}>
                  <Table.Td>
                    <Text fw={600} size="sm">{plan.name}</Text>
                    <Text size="xs" c="dimmed">{plan.profile}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{plan.download_mbps} / {plan.upload_mbps} Mbps</Text>
                    <Text size="xs" c="dimmed">bajada / subida</Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text fw={600} size="sm">{fmtMoney(plan.price)}</Text>
                    <Text size="xs" c="dimmed">IVA {plan.iva_percent}% · neto {fmtMoney(plan.price_net)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <MutedBadge tone={plan.is_active ? "green" : "red"} size="sm">
                      {plan.is_active ? "Activo" : "Inactivo"}
                    </MutedBadge>
                  </Table.Td>
                  <Table.Td ta="center">
                    <Text size="sm">{plan.connections_count}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={8} wrap="nowrap">
                      <Tooltip label="Editar">
                        <ActionIcon variant="light" color="violet" size="lg" onClick={() => openEdit(plan)} aria-label="Editar plan">
                          <IconPencil size={18} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label={plan.connections_count > 0 ? "Tiene conexiones asignadas" : "Eliminar"}>
                        <ActionIcon
                          variant="light"
                          color="red"
                          size="lg"
                          disabled={plan.connections_count > 0}
                          onClick={() => setDeleteTarget(plan)}
                          aria-label="Eliminar plan"
                        >
                          <IconTrash size={18} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>

      {/* Modal crear/editar */}
      <Modal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Editar plan: ${editing.name}` : "Nuevo plan"}
        size="md"
      >
        <Stack gap="md">
          <TextInput
            label="Nombre"
            placeholder="ej: 50 Megas"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.currentTarget.value })}
            required
          />
          <TextInput
            label="Profile Mikrotik"
            placeholder="ej: 50M"
            value={form.profile}
            onChange={(e) => setForm({ ...form, profile: e.currentTarget.value })}
            required
          />
          <Group grow>
            <NumberInput
              label="Bajada (Mbps)"
              value={form.download_mbps}
              onChange={(v) => setForm({ ...form, download_mbps: Number(v) || 0 })}
              min={0}
            />
            <NumberInput
              label="Subida (Mbps)"
              value={form.upload_mbps}
              onChange={(v) => setForm({ ...form, upload_mbps: Number(v) || 0 })}
              min={0}
            />
          </Group>
          <TextInput
            label="Rate-limit Mikrotik (opcional)"
            description="Si queda vacío se usa subida/bajada. Solo hace falta si el profile usa burst."
            placeholder="vacío = automático"
            value={form.rate_limit}
            onChange={(e) => setForm({ ...form, rate_limit: e.currentTarget.value })}
          />
          <Group grow>
            <NumberInput
              label="Precio final (IVA incluido)"
              description="Lo que paga el cliente; el neto y el IVA se calculan abajo."
              value={form.price}
              onChange={(v) => setForm({ ...form, price: Number(v) || 0 })}
              min={0}
              decimalScale={2}
              prefix="$"
              thousandSeparator="."
              decimalSeparator=","
            />
            <NumberInput
              label="IVA %"
              value={form.iva_percent}
              onChange={(v) => setForm({ ...form, iva_percent: Number(v) || 0 })}
              min={0}
              max={100}
              decimalScale={2}
              suffix="%"
            />
          </Group>
          <Text size="xs" c="dimmed">
            {(() => {
              const { net, iva } = netAndIvaFromGross(form.price, form.iva_percent);
              const fmt = (n: number) =>
                `$${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
              return `Desglose: neto gravado ${fmt(net)} + IVA ${fmt(iva)} = ${fmt(form.price)}`;
            })()}
          </Text>
          <Switch
            label="Plan activo"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.currentTarget.checked })}
          />
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={saving || !form.name || !form.profile}>
              {saving ? "Guardando..." : editing ? "Guardar cambios" : "Crear plan"}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Modal confirmar eliminación */}
      <Modal
        opened={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Confirmar eliminación"
        size="sm"
      >
        <Stack gap="md">
          <Text>
            ¿Estás seguro de eliminar el plan <strong>{deleteTarget?.name}</strong> ({deleteTarget?.profile})?
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Eliminando..." : "Eliminar"}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
