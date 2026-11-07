import React, { useEffect, useState } from "react";
import { Alert, Button, Group, Modal, Paper, SegmentedControl, Select, Stack, Text, Textarea, ThemeIcon, Title } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconFileInvoice, IconMessagePlus, IconTool } from "@tabler/icons-react";
import { MutedBadge, complaintStatusTone } from "../../ui";
import { complaintStatusLabel, formatApiError } from "../../format";
import { fmtDateTime } from "../../datetime";
import { portalApi } from "../api";
import { notifySuccess } from "../../notify";

const KIND_OPTIONS = [
  { value: "TECH", label: "Técnico" },
  { value: "BILLING", label: "Facturación" },
];

function connectionLabel(c: any): string {
  return `${c.service_address || `Conexión #${c.id}`}${c.plan_profile ? ` · ${c.plan_profile}` : ""}`;
}

function ComplaintItem(props: { item: any }) {
  const x = props.item;
  const billing = x.kind === "BILLING";
  return (
    <Paper withBorder radius="md" p="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
        <Group gap="sm" wrap="nowrap" align="flex-start" style={{ minWidth: 0 }}>
          <ThemeIcon variant="light" color={billing ? "blue" : "violet"} radius="md" size={36}>
            {billing ? <IconFileInvoice size={20} /> : <IconTool size={20} />}
          </ThemeIcon>
          <div style={{ minWidth: 0 }}>
            <Text fw={600}>{billing ? "Facturación" : "Técnico"}</Text>
            <Text size="xs" c="dimmed">{fmtDateTime(x.created_at)}</Text>
          </div>
        </Group>
        <MutedBadge tone={complaintStatusTone(x.status)}>{complaintStatusLabel(x.status)}</MutedBadge>
      </Group>
      {x.detail ? (
        <Text size="sm" mt="sm" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }} lineClamp={4}>
          {x.detail}
        </Text>
      ) : null}
      {x.solved_human ? (
        <Text size="xs" c="dimmed" mt="xs">Resuelto en {x.solved_human}</Text>
      ) : null}
    </Paper>
  );
}

export function PortalComplaints() {
  const isMobile = useMediaQuery("(max-width: 48em)");
  const [items, setItems] = useState<any[]>([]);
  const [conns, setConns] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [kind, setKind] = useState<string>("TECH");
  const [detail, setDetail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reload() {
    Promise.all([portalApi.complaints(), portalApi.connections()])
      .then(([c, conns]) => {
        setItems(c);
        setConns(conns);
        if (!connectionId && conns[0]) setConnectionId(String(conns[0].id));
      })
      .catch((e) => setError(formatApiError(e)))
      .finally(() => setLoaded(true));
  }

  useEffect(() => {
    reload();
  }, []);

  function openForm() {
    setFormError(null);
    setOpen(true);
  }

  async function submit() {
    if (!connectionId) {
      setFormError("Elegí una conexión.");
      return;
    }
    if (!detail.trim()) {
      setFormError("Contanos qué pasó.");
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await portalApi.createComplaint({ connection_id: Number(connectionId), kind, detail: detail.trim() });
      setDetail("");
      setOpen(false);
      notifySuccess("Reclamo enviado. Te avisamos cuando haya novedades.");
      reload();
    } catch (e: unknown) {
      setFormError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end" gap="sm">
        <div>
          <Title order={2} fw={700}>Ayuda</Title>
          <Text c="dimmed" size="sm">Tus reclamos y su estado.</Text>
        </div>
        {items.length ? (
          <Button color="violet" leftSection={<IconMessagePlus size={18} />} onClick={openForm}>
            Nuevo reclamo
          </Button>
        ) : null}
      </Group>

      {error ? <Alert color="red">{error}</Alert> : null}

      {loaded && !items.length ? (
        <Paper withBorder radius="md" p="xl" ta="center">
          <Stack align="center" gap="xs">
            <ThemeIcon variant="light" color="violet" radius="xl" size={48}>
              <IconMessagePlus size={26} />
            </ThemeIcon>
            <Text fw={600}>¿Tenés algún problema?</Text>
            <Text size="sm" c="dimmed">Si tu internet anda mal o tenés una duda con una factura, mandanos un reclamo.</Text>
            <Button color="violet" mt="xs" onClick={openForm}>Nuevo reclamo</Button>
          </Stack>
        </Paper>
      ) : (
        <Stack gap="sm">
          {items.map((x) => <ComplaintItem key={x.id} item={x} />)}
        </Stack>
      )}

      <Modal opened={open} onClose={() => setOpen(false)} title="Nuevo reclamo" fullScreen={isMobile} centered radius="md">
        <Stack>
          {formError ? <Alert color="red">{formError}</Alert> : null}
          <div>
            <Text size="sm" fw={500} mb={6}>¿Sobre qué es?</Text>
            <SegmentedControl fullWidth color="violet" value={kind} onChange={setKind} data={KIND_OPTIONS} />
          </div>
          {conns.length > 1 ? (
            <Select
              label="Conexión"
              value={connectionId}
              onChange={setConnectionId}
              data={conns.map((c) => ({ value: String(c.id), label: connectionLabel(c) }))}
              allowDeselect={false}
            />
          ) : null}
          <Textarea
            label="¿Qué pasó?"
            placeholder={kind === "BILLING" ? "Ej: me llegó una factura con un monto que no reconozco." : "Ej: desde ayer a la noche no tengo internet."}
            autosize
            minRows={4}
            value={detail}
            onChange={(e) => setDetail(e.currentTarget.value)}
          />
          <Button color="violet" loading={busy} onClick={submit} fullWidth>Enviar reclamo</Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
