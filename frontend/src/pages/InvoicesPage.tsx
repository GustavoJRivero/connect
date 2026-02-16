import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Button } from "../ui";
import { InvoiceModal } from "../components/InvoiceModal";
import { PaymentModal } from "../components/PaymentModal";
import {
  Grid,
  Table,
  Alert,
  Card,
  Title,
  Group,
  Anchor,
  Skeleton,
  Badge,
  Stack,
} from "@mantine/core";

type InvoiceRow = {
  id: number;
  invoice_type?: string;
  point_of_sale?: number;
  cbte_number?: string;
  client_id: number;
  connection_id?: number;
  total: string;
  paid_total?: string;
  due_date?: string;
  status: string;
};

export default function InvoicesPage() {
  const [items, setItems] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState<InvoiceRow | null>(null);
  const [showNewInvoice, setShowNewInvoice] = useState(false);

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
        <Alert color="red" className="sc-error" title="Error">
          {error}
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
                <Table.Th>PV</Table.Th>
                <Table.Th>N°</Table.Th>
                <Table.Th>Cliente</Table.Th>
                <Table.Th>Conexión</Table.Th>
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
                    {Array.from({ length: 11 }).map((_, j) => (
                      <Table.Td key={j}>
                        <Skeleton height={20} width={j === 10 ? 120 : "80%"} />
                      </Table.Td>
                    ))}
                  </Table.Tr>
                ))
              ) : items.length ? (
                items.map((x) => (
                  <Table.Tr key={x.id}>
                    <Table.Td>#{x.id}</Table.Td>
                    <Table.Td>{x.invoice_type}</Table.Td>
                    <Table.Td>{x.point_of_sale}</Table.Td>
                    <Table.Td>{x.cbte_number ?? "-"}</Table.Td>
                    <Table.Td>
                      <Anchor component={Link} to={`/clients/${x.client_id}`} size="sm">
                        #{x.client_id}
                      </Anchor>
                    </Table.Td>
                    <Table.Td>{x.connection_id ?? "-"}</Table.Td>
                    <Table.Td fw={600}>{x.total}</Table.Td>
                    <Table.Td>{x.paid_total ?? "0"}</Table.Td>
                    <Table.Td>{x.due_date ?? "-"}</Table.Td>
                    <Table.Td>
                      <Badge size="sm" color={statusColor(x.status)} variant="light">
                        {x.status}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        {x.status === "DRAFT" ? (
                          <Button variant="primary" onClick={() => issue(x.id)}>
                            Emitir
                          </Button>
                        ) : null}
                        {(x.status === "ISSUED" || x.status === "DRAFT") ? (
                          <Button variant="primary" onClick={() => setPaying(x)}>
                            Registrar pago
                          </Button>
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
                  <Table.Td colSpan={11} c="dimmed" py="xl" ta="center">
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
