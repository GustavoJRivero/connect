import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Button, InvoiceStatusBadge, MutedBadge } from "../ui";
import { InvoiceModal } from "../components/InvoiceModal";
import { PaymentModal } from "../components/PaymentModal";
import { ConfirmDialog, ConfirmState } from "../components/ConfirmDialog";
import { ClientSelect } from "../components/ClientSelect";
import { formatApiError, fmtMoney } from "../format";
import { fmtDate } from "../datetime";
import { notifySuccess } from "../notify";
import {
  Table,
  Alert,
  Card,
  Title,
  Group,
  Anchor,
  Skeleton,
  Stack,
  ActionIcon,
  Tooltip,
  Grid,
} from "@mantine/core";
import { IconCash, IconFileCheck, IconFileTypePdf, IconMail, IconRefresh, IconTrash } from "@tabler/icons-react";

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
  payment_status?: string;
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
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [filterClientId, setFilterClientId] = useState("");

  async function reload() {
    setError(null);
    setLoading(true);
    try {
      const res = await api.listInvoices(filterClientId ? Number(filterClientId) : undefined);
      setItems(Array.isArray(res) ? (res as InvoiceRow[]) : []);
    } catch (e: unknown) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterClientId]);

  async function issue(id: number) {
    setError(null);
    try {
      await api.issueInvoice(id);
      notifySuccess(`Factura #${id} emitida.`);
      await reload();
    } catch (e: unknown) {
      setError(formatApiError(e));
    }
  }

  function removeInvoice(id: number) {
    setConfirm({
      title: `Eliminar factura #${id}`,
      message: "La factura se dará de baja (baja lógica). Solo es posible si no tiene pagos registrados.",
      confirmLabel: "Eliminar factura",
      danger: true,
      onConfirm: async () => {
        setError(null);
        try {
          await api.deleteInvoice(id);
          if (paying?.id === id) setPaying(null);
          notifySuccess(`Factura #${id} eliminada.`);
          await reload();
        } catch (e: unknown) {
          setError(formatApiError(e));
        }
      },
    });
  }

  function openPdf(id: number) {
    const url = api.getInvoicePdfUrl(id);
    window.open(url, "_blank");
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

  return (
    <Stack gap="md">
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
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
          notifySuccess("Pago registrado correctamente.");
          await reload();
        }}
      />

      {error ? (
        <Alert color="red" title="Error" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      <Card withBorder padding="lg" radius="md">
        <Card.Section withBorder inheritPadding py="sm">
          <Group justify="space-between">
            <Title order={5}>Facturas</Title>
            <Group gap="xs">
              <Button
                variant="primaryLight"
                onClick={() => {
                  setShowNewInvoice(true);
                  setError(null);
                }}
              >
                Nueva factura
              </Button>
              <Tooltip label="Recargar">
                <ActionIcon size="lg" variant="light" color="violet" onClick={reload} aria-label="Recargar">
                  <IconRefresh size={20} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
        </Card.Section>

        <Grid mt="md">
          <Grid.Col span={{ base: 12, md: 4 }}>
            <ClientSelect label="Filtrar por cliente" clearable value={filterClientId} onChange={setFilterClientId} />
          </Grid.Col>
        </Grid>

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
                      <MutedBadge tone="gray" size="sm">
                        {x.invoice_type}
                      </MutedBadge>
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
                    <Table.Td fw={600}>{fmtMoney(x.total)}</Table.Td>
                    <Table.Td>{fmtMoney(x.paid_total ?? 0)}</Table.Td>
                    <Table.Td>{fmtDate(x.due_date) || "-"}</Table.Td>
                    <Table.Td>
                      <InvoiceStatusBadge status={x.payment_status ?? x.status} size="lg" />
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4} wrap="nowrap">
                        {x.status === "DRAFT" ? (
                          <Tooltip label="Emitir">
                            <ActionIcon variant="light" color="orange" onClick={() => issue(x.id)} aria-label="Emitir">
                              <IconFileCheck size={16} />
                            </ActionIcon>
                          </Tooltip>
                        ) : null}
                        <Tooltip label="Ver PDF">
                          <ActionIcon variant="light" color="violet" onClick={() => openPdf(x.id)} aria-label="Ver PDF">
                            <IconFileTypePdf size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Enviar por email">
                          <ActionIcon
                            variant="light"
                            color="teal"
                            loading={sendingEmail === x.id}
                            onClick={() => sendEmail(x.id)}
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
                          <ActionIcon variant="light" color="red" onClick={() => removeInvoice(x.id)} aria-label="Eliminar">
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Tooltip>
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
