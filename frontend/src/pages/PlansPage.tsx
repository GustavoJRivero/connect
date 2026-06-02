import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Button } from "../ui";
import {
  Stack,
  Alert,
  Table,
  Badge,
  Group,
  Modal,
  TextInput,
  NumberInput,
  Switch,
  Text,
  ActionIcon,
  Tooltip,
  Card,
  Title,
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
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
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
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
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
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
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

      <Card withBorder padding="lg" radius="md">
        <Card.Section withBorder inheritPadding py="sm">
          <Group justify="space-between">
            <Title order={5}>Planes de servicio</Title>
            <Group gap="xs">
              <Button variant="default" onClick={loadPlans}>
                Recargar
              </Button>
              <Button variant="primary" onClick={openCreate}>
                Nuevo plan
              </Button>
            </Group>
          </Group>
        </Card.Section>

        <Card.Section inheritPadding py="md">
          {loading ? (
            <Center py="xl">
              <Loader size="md" />
            </Center>
          ) : plans.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">
              No hay planes cargados.
            </Text>
          ) : (
            <Table striped highlightOnHover withTableBorder withColumnBorders>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Nombre</Table.Th>
                  <Table.Th>Profile MK</Table.Th>
                  <Table.Th ta="center">Bajada</Table.Th>
                  <Table.Th ta="center">Subida</Table.Th>
                  <Table.Th>Rate-limit MK</Table.Th>
                  <Table.Th ta="right">Precio final</Table.Th>
                  <Table.Th ta="right">IVA %</Table.Th>
                  <Table.Th ta="right">Neto</Table.Th>
                  <Table.Th ta="right">IVA $</Table.Th>
                  <Table.Th ta="center">Estado</Table.Th>
                  <Table.Th ta="center">Conexiones</Table.Th>
                  <Table.Th ta="center">Acciones</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {plans.map((plan) => (
                  <Table.Tr key={plan.id}>
                    <Table.Td fw={500}>{plan.name}</Table.Td>
                    <Table.Td>
                      <Badge variant="light" color="gray" size="sm">
                        {plan.profile}
                      </Badge>
                    </Table.Td>
                    <Table.Td ta="center">{plan.download_mbps} Mbps</Table.Td>
                    <Table.Td ta="center">{plan.upload_mbps} Mbps</Table.Td>
                    <Table.Td>
                      <Tooltip label={plan.rate_limit ? "rate-limit personalizado" : "auto: upload/download"}>
                        <Text size="xs" ff="monospace" c={plan.rate_limit ? undefined : "dimmed"}>
                          {plan.computed_rate_limit}
                        </Text>
                      </Tooltip>
                    </Table.Td>
                    <Table.Td ta="right" fw={600}>
                      ${Number(plan.price).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </Table.Td>
                    <Table.Td ta="right">{plan.iva_percent}%</Table.Td>
                    <Table.Td ta="right">${Number(plan.price_net).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</Table.Td>
                    <Table.Td ta="right">${Number(plan.iva_amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</Table.Td>
                    <Table.Td ta="center">
                      <Badge color={plan.is_active ? "green" : "red"} variant="filled" size="sm">
                        {plan.is_active ? "Activo" : "Inactivo"}
                      </Badge>
                    </Table.Td>
                    <Table.Td ta="center">
                      <Badge variant="light" size="sm">
                        {plan.connections_count}
                      </Badge>
                    </Table.Td>
                    <Table.Td ta="center">
                      <Group gap={4} justify="center">
                        <Tooltip label="Editar">
                          <ActionIcon variant="light" color="blue" onClick={() => openEdit(plan)}>
                            ✏️
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label={plan.connections_count > 0 ? "Tiene conexiones asignadas" : "Eliminar"}>
                          <ActionIcon
                            variant="light"
                            color="red"
                            disabled={plan.connections_count > 0}
                            onClick={() => setDeleteTarget(plan)}
                          >
                            🗑️
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Card.Section>
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
            description='Se manda tal cual a /ppp/profile. Si lo dejás vacío se usa "{upload}M/{download}M". Formato: "rxR/txR rxBurst/txBurst rxThr/txThr rxTime/txTime prio rxMin/txMin".'
            placeholder="ej: 500M/500M 550M/550M 255M/255M 40/40 0 20M/20M"
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
