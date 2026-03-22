import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Button } from "../ui";
import { InvoiceModal } from "../components/InvoiceModal";
import { PaymentModal } from "../components/PaymentModal";
import {
  Table,
  Alert,
  Card,
  Title,
  Group,
  Anchor,
  Skeleton,
  Badge,
  Stack,
  ActionIcon,
  Tooltip,
} from "@mantine/core";

type InvoiceRow = {
  id: number;
  invoice_type?: string;
  point_of_sale?: number;
  cbte_number?: string;
  client_id: number;
  client_name?: string;
  connection_id?: number;
  total: string;
  paid_total?: string;
  due_date?: string;
  status: string;
  description?: string;
  notes?: string;
};

export default function InvoicesPage() {
  const [items, setItems] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState<InvoiceRow | null>(null);
  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [sendingEmail, setSendingEmail] = useState<number | null>(null);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);
  const [mpLoading, setMpLoading] = useState<number | null>(null);

  async function reload() {
    setError(null);
    setLoading(true);
    try {
      const res = await api.listInvoices();
      setItems(Array.isArray(res) ? (res as InvoiceRow[]) : []);
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function issue(id: number) {
    setError(null);
    try {
      await api.issueInvoice(id);
      await reload();
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    }
  }

  async function removeInvoice(id: number) {
    setError(null);
    try {
      if (!window.confirm("¿Eliminar factura? (baja lógica, solo si no tiene pagos)")) return;
      await api.deleteInvoice(id);
      if (paying?.id === id) setPaying(null);
      await reload();
    } catch (e: unknown) {
      const err = e as { status?: number; body?: unknown };
      setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
    }
  }

  function openPdf(id: number) {
    const url = api.getInvoicePdfUrl(id);
    window.open(url, "_blank");
  }

  async function payWithMp(inv: InvoiceRow) {
    setError(null);
    setMpLoading(inv.id);
    try {
      const res = (await api.createMpPreference({
        client_id: inv.client_id,
        invoice_ids: [inv.id],
      })) as { init_point?: string; sandbox_init_point?: string };
      const url = res.init_point || res.sandbox_init_point;
      if (url) window.open(url, "_blank");
    } catch (e: unknown) {
      const err = e as { status?: number; body?: any };
      setError(err?.body?.detail || err?.body?.error || "Error al generar link de pago");
    } finally {
      setMpLoading(null);
    }
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

  const statusColor = (status: string) =>
    status === "ISSUED" ? "green" : status === "DRAFT" ? "gray" : status === "OVERDUE" ? "red" : "blue";

  return (
    <Stack gap="md">
      <InvoiceModal
        open={showNewInvoice}
        onClose={() => setShowNewInvoice(false)}
        onSaved={async () => {
          setShowNewInvoice(false);
          await reload();
        }}
      />

      <PaymentModal
        open={!!paying}
        invoice={paying}
        onClose={() => setPaying(null)}
        onSaved={async () => {
          setPaying(null);
          await reload();
        }}
      />

      {error ? (
        <Alert color="red" className="sc-error" title="Error" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      {emailSuccess ? (
        <Alert color="green" title="Email enviado" withCloseButton onClose={() => setEmailSuccess(null)}>
          {emailSuccess}
        </Alert>
      ) : null}

      <Card withBorder padding="lg" radius="md">
        <Card.Section withBorder inheritPadding py="sm">
          <Group justify="space-between">
            <Title order={5}>Facturas</Title>
            <Group gap="xs">
              <Button
                variant="primary"
                onClick={() => {
                  setShowNewInvoice(true);
                  setError(null);
                }}
              >
                Nueva factura
              </Button>
              <Button variant="default" onClick={reload}>
                Recargar
              </Button>
            </Group>
          </Group>
        </Card.Section>

        <Table.ScrollContainer minWidth={800} mt="md">
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>ID</Table.Th>
                <Table.Th>Tipo</Table.Th>
                <Table.Th>N°</Table.Th>
                <Table.Th>Cliente</Table.Th>
                <Table.Th>Concepto</Table.Th>
                <Table.Th>Total</Table.Th>
                <Table.Th>Pagado</Table.Th>
                <Table.Th>Vence</Table.Th>
                <Table.Th>Estado</Table.Th>
                <Table.Th>Acciones</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <Table.Tr key={i}>
                    {Array.from({ length: 10 }).map((_, j) => (
                      <Table.Td key={j}>
                        <Skeleton height={20} width={j === 9 ? 120 : "80%"} />
                      </Table.Td>
                    ))}
                  </Table.Tr>
                ))
              ) : items.length ? (
                items.map((x) => (
                  <Table.Tr key={x.id}>
                    <Table.Td>#{x.id}</Table.Td>
                    <Table.Td>
                      <Badge variant="light" size="sm">
                        {x.invoice_type}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{x.cbte_number ? `${String(x.point_of_sale ?? 0).padStart(5, "0")}-${String(x.cbte_number).padStart(8, "0")}` : "-"}</Table.Td>
                    <Table.Td>
                      <Anchor component={Link} to={`/clients/${x.client_id}`} size="sm">
                        {x.client_name || `#${x.client_id}`}
                      </Anchor>
                    </Table.Td>
                    <Table.Td style={{ maxWidth: 200 }}>
                      {x.description ? (
                        <Tooltip label={x.description} disabled={x.description.length <= 30}>
                          <span style={{ fontSize: "var(--mantine-font-size-sm)" }}>
                            {x.description.length > 30 ? x.description.slice(0, 30) + "..." : x.description}
                          </span>
                        </Tooltip>
                      ) : (
                        <span style={{ fontSize: "var(--mantine-font-size-sm)", color: "var(--mantine-color-dimmed)" }}>
                          Servicio
                        </span>
                      )}
                    </Table.Td>
                    <Table.Td fw={600}>${x.total}</Table.Td>
                    <Table.Td>${x.paid_total ?? "0"}</Table.Td>
                    <Table.Td>{x.due_date ?? "-"}</Table.Td>
                    <Table.Td>
                      <Badge size="sm" color={statusColor(x.status)} variant="light">
                        {x.status}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4} wrap="nowrap">
                        <Tooltip label="Ver PDF">
                          <ActionIcon variant="light" color="blue" onClick={() => openPdf(x.id)}>
                            📄
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Enviar vía Mail">
                          <ActionIcon
                            variant="light"
                            color="teal"
                            loading={sendingEmail === x.id}
                            onClick={() => sendEmail(x.id)}
                          >
                            ✉️
                          </ActionIcon>
                        </Tooltip>
                        {x.status === "DRAFT" ? (
                          <Button variant="primary" onClick={() => issue(x.id)}>
                            Emitir
                          </Button>
                        ) : null}
                        {(x.status === "ISSUED" || x.status === "DRAFT") ? (
                          <Button variant="primary" onClick={() => setPaying(x)}>
                            Pagar
                          </Button>
                        ) : null}
                        {(x.status === "ISSUED" || x.status === "DRAFT") ? (
                          <Tooltip label="Generar link de pago con Mercado Pago">
                            <ActionIcon
                              variant="light"
                              color="cyan"
                              loading={mpLoading === x.id}
                              onClick={() => payWithMp(x)}
                            >
                              MP
                            </ActionIcon>
                          </Tooltip>
                        ) : null}
                        <Button variant="danger" onClick={() => removeInvoice(x.id)}>
                          Eliminar
                        </Button>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))
              ) : (
                <Table.Tr>
                  <Table.Td colSpan={10} c="dimmed" py="xl" ta="center">
                    No hay facturas. Creá una con "Nueva factura".
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
    </Stack>
  );
}
