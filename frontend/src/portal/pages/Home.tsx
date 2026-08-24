import React, { useEffect, useState } from "react";
import { Alert, SimpleGrid, Stack, Text, Title, Group, UnstyledButton } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import { InvoiceStatusBadge, Button } from "../../ui";
import { connectionStatusLabel, fmtMoney, formatApiError } from "../../format";
import { fmtDate } from "../../datetime";
import { portalApi } from "../api";
import {
  IconBell,
  IconChevronRight,
  IconFileInvoice,
  IconHeadset,
  IconWifi,
} from "@tabler/icons-react";

function HomeSkeleton() {
  return (
    <Stack gap="lg">
      <div className="portal-skel" style={{ height: 28, width: 160 }} />
      <div className="portal-skel" style={{ height: 148 }} />
      <div className="portal-skel" style={{ height: 96 }} />
      <SimpleGrid cols={2} spacing="sm">
        <div className="portal-skel" style={{ height: 118 }} />
        <div className="portal-skel" style={{ height: 118 }} />
        <div className="portal-skel" style={{ height: 118 }} />
        <div className="portal-skel" style={{ height: 118 }} />
      </SimpleGrid>
    </Stack>
  );
}

export function PortalHome() {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    portalApi.summary().then(setData).catch((e) => setError(formatApiError(e)));
  }, []);

  if (error) return <Alert color="red">{error}</Alert>;
  if (!data) return <HomeSkeleton />;

  const debt = Number(data.debt || 0);
  const conns = Array.isArray(data.connections) ? data.connections : [];
  const recent = Array.isArray(data.recent_invoices) ? data.recent_invoices : [];
  const main = conns[0];
  const allCut = conns.length > 0 && conns.every((c: any) => c.status === "CUT");
  const heroClass = !conns.length ? "warn" : allCut ? "bad" : "ok";
  const heroTitle = !conns.length ? "Sin servicio cargado" : allCut ? "Internet cortado" : "Internet activo";

  return (
    <Stack gap="lg">
      <Title order={2} fw={700} lh={1.15}>Tu cuenta</Title>

      <div className={`portal-hero ${heroClass}`}>
        <Group justify="space-between" align="flex-start">
          <div>
            <Text size="sm" c="#fff" style={{ opacity: 0.85 }}>Estado de tu conexión</Text>
            <Text fz={26} fw={700} lh={1.2} mt={4} c="#fff">{heroTitle}</Text>
            {main ? (
              <Text mt={8} c="#fff" style={{ opacity: 0.92 }}>
                Plan {main.plan_profile || "—"}
                {main.service_address ? ` · ${main.service_address}` : ""}
              </Text>
            ) : null}
          </div>
          <IconWifi size={36} stroke={1.6} color="#fff" />
        </Group>
        <UnstyledButton onClick={() => navigate("/portal/connection")} style={{ marginTop: 16, color: "#fff" }}>
          <Group gap={4}>
            <Text size="sm" fw={600} c="#fff">Ver detalle</Text>
            <IconChevronRight size={16} color="#fff" />
          </Group>
        </UnstyledButton>
      </div>

      <div className="portal-invoice">
        <Text size="sm" c="dimmed" fw={500}>{debt > 0 ? "Pendiente de cobro" : "Cuenta al día"}</Text>
        <Group justify="space-between" align="flex-end" mt={4}>
          <Text fz={28} fw={700}>{fmtMoney(debt)}</Text>
          {debt > 0 ? (
            <Button variant="primary" onClick={() => navigate("/portal/invoices")}>Pagar</Button>
          ) : null}
        </Group>
        {data.unpaid_count > 0 ? (
          <Text size="sm" c="dimmed" mt={8}>
            {data.unpaid_count} factura{data.unpaid_count === 1 ? "" : "s"} pendiente{data.unpaid_count === 1 ? "" : "s"}
            {data.overdue_count > 0 ? ` · ${data.overdue_count} vencida${data.overdue_count === 1 ? "" : "s"}` : ""}
          </Text>
        ) : null}
      </div>

      <SimpleGrid cols={2} spacing="sm">
        <UnstyledButton className="portal-tile" onClick={() => navigate("/portal/invoices")}>
          <div className="portal-tile-icon" style={{ background: "rgba(122, 79, 176, 0.14)", color: "#7a4fb0" }}>
            <IconFileInvoice size={22} />
          </div>
          <div>
            <Text fw={700}>Facturas</Text>
            <Text size="sm" c="dimmed">PDF y pago online</Text>
          </div>
        </UnstyledButton>
        <UnstyledButton className="portal-tile" onClick={() => navigate("/portal/connection")}>
          <div className="portal-tile-icon" style={{ background: "rgba(79, 138, 104, 0.16)", color: "#4f8a68" }}>
            <IconWifi size={22} />
          </div>
          <div>
            <Text fw={700}>Internet</Text>
            <Text size="sm" c="dimmed">{main ? connectionStatusLabel(main.status) : "Tus datos"}</Text>
          </div>
        </UnstyledButton>
        <UnstyledButton className="portal-tile" onClick={() => navigate("/portal/complaints")}>
          <div className="portal-tile-icon" style={{ background: "rgba(176, 122, 79, 0.16)", color: "#9a6a3c" }}>
            <IconHeadset size={22} />
          </div>
          <div>
            <Text fw={700}>Ayuda</Text>
            <Text size="sm" c="dimmed">Abrí un reclamo</Text>
          </div>
        </UnstyledButton>
        <UnstyledButton className="portal-tile" onClick={() => navigate("/portal/notices")}>
          <div className="portal-tile-icon" style={{ background: "rgba(122, 79, 176, 0.14)", color: "#7a4fb0" }}>
            <IconBell size={22} />
          </div>
          <div>
            <Text fw={700}>Avisos</Text>
            <Text size="sm" c="dimmed">
              {data.unread_notifications > 0 ? `${data.unread_notifications} nuevo(s)` : "Sin novedades"}
            </Text>
          </div>
        </UnstyledButton>
      </SimpleGrid>

      <div>
        <Group justify="space-between" mb="sm">
          <Text fw={700}>Últimas facturas</Text>
          <UnstyledButton onClick={() => navigate("/portal/invoices")}>
            <Text size="sm" c="violet" fw={600}>Ver todas</Text>
          </UnstyledButton>
        </Group>
        {!recent.length ? (
          <Text c="dimmed">Todavía no hay facturas.</Text>
        ) : (
          <Stack gap="sm">
            {recent.map((x: any) => (
              <UnstyledButton key={x.id} className="portal-invoice" onClick={() => navigate("/portal/invoices")} style={{ width: "100%" }}>
                <Group justify="space-between">
                  <div>
                    <Text fw={600}>Factura {x.invoice_type} {x.id}</Text>
                    <Text size="sm" c="dimmed">{fmtDate(x.issue_date)} · {fmtMoney(x.total)}</Text>
                  </div>
                  <InvoiceStatusBadge status={x.payment_status || x.status} size="md" />
                </Group>
              </UnstyledButton>
            ))}
          </Stack>
        )}
      </div>
    </Stack>
  );
}
