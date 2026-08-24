import React, { useEffect, useState } from "react";
import { Alert, Group, Modal, Stack, Text, Title } from "@mantine/core";
import { useSearchParams } from "react-router-dom";
import { Button, InvoiceStatusBadge } from "../../ui";
import { fmtMoney, formatApiError } from "../../format";
import { fmtDate } from "../../datetime";
import { portalApi } from "../api";
import { MpWallet } from "../MpWallet";

export function PortalInvoices() {
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState<any>(null);
  const [checkout, setCheckout] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [params] = useSearchParams();
  const paidFlag = params.get("paid");

  function reload() {
    portalApi.invoices().then(setItems).catch((e) => setError(formatApiError(e)));
  }

  useEffect(() => {
    reload();
  }, []);

  async function openPdf(id: number) {
    try {
      const blob = await portalApi.invoicePdf(id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (e: unknown) {
      setError(formatApiError(e));
    }
  }

  async function startPay(inv: any) {
    setError(null);
    setBusy(true);
    setPaying(inv);
    setCheckout(null);
    try {
      const res = await portalApi.checkout(Number(inv.id));
      setCheckout(res);
    } catch (e: unknown) {
      setError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack gap="lg">
      <Title order={2} fw={700}>Facturas</Title>
      {paidFlag === "1" ? <Alert color="green" title="Pago recibido">Si Mercado Pago confirmó el cobro, en unos segundos se imputa a tu factura.</Alert> : null}
      {paidFlag === "0" ? <Alert color="red">El pago no se completó. Podés intentar de nuevo.</Alert> : null}
      {error ? <Alert color="red">{error}</Alert> : null}
      {!items.length ? <Text c="dimmed">No hay facturas para mostrar.</Text> : null}
      {items.map((x) => {
        const remaining = Number(x.total || 0) - Number(x.paid_total || 0);
        const payable = String(x.status).toUpperCase() === "ISSUED" && remaining > 0;
        return (
          <div key={x.id} className="portal-invoice">
            <Group justify="space-between" align="flex-start">
              <div>
                <Text fw={700}>Factura {x.invoice_type} {x.id}</Text>
                <Text size="sm" c="dimmed">
                  {fmtDate(x.issue_date) || "—"}
                  {x.due_date ? ` · vence ${fmtDate(x.due_date)}` : ""}
                </Text>
              </div>
              <InvoiceStatusBadge status={x.payment_status || x.status} size="md" />
            </Group>
            <Group justify="space-between" mt="md" align="center">
              <Text fz={22} fw={700}>{fmtMoney(x.total)}</Text>
              <Group gap={8}>
                <Button variant="default" onClick={() => openPdf(Number(x.id))}>PDF</Button>
                {payable ? <Button variant="primary" onClick={() => startPay(x)}>Pagar</Button> : null}
              </Group>
            </Group>
          </div>
        );
      })}

      <Modal opened={!!paying} onClose={() => { setPaying(null); setCheckout(null); }} title={paying ? `Pagar factura ${paying.id}` : "Pagar"} size="md" radius="lg">
        {paying ? (
          <Stack>
            <Text>Importe: <b>{fmtMoney(Number(paying.total) - Number(paying.paid_total || 0))}</b></Text>
            {checkout?.preference_id && checkout?.public_key ? (
              <MpWallet publicKey={checkout.public_key} preferenceId={checkout.preference_id} initPoint={checkout.init_point} />
            ) : (
              <Text c="dimmed">{busy ? "Preparando Mercado Pago…" : "El pago online no está disponible."}</Text>
            )}
          </Stack>
        ) : null}
      </Modal>
    </Stack>
  );
}
