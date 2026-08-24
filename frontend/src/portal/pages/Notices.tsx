import React, { useEffect, useState } from "react";
import { Alert, Group, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import { useOutletContext } from "react-router-dom";
import { Button, Card } from "../../ui";
import { formatApiError } from "../../format";
import { fmtDateTime } from "../../datetime";
import { portalApi } from "../api";
import type { PortalOutletContext } from "../PortalShell";

export function PortalNotices() {
  const { onRefresh } = useOutletContext<PortalOutletContext>();
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    portalApi.notifications().then(setItems).catch((e) => setError(formatApiError(e)));
  }

  useEffect(() => {
    reload();
  }, []);

  async function mark(id: number) {
    await portalApi.readNotification(id);
    reload();
    onRefresh();
  }

  async function markAll() {
    await portalApi.readAllNotifications();
    reload();
    onRefresh();
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={2} fw={700}>Avisos</Title>
        {items.some((x) => !x.read_at) ? <Button variant="default" onClick={markAll}>Marcar leídos</Button> : null}
      </Group>
      {error ? <Alert color="red">{error}</Alert> : null}
      {!items.length ? <Text c="dimmed">No hay avisos todavía.</Text> : null}
      {items.map((n) => (
        <UnstyledButton key={n.id} onClick={() => { if (!n.read_at) void mark(n.id); }} style={{ display: "block", width: "100%", textAlign: "left" }}>
          <Card>
            <Group justify="space-between" align="flex-start">
              <div>
                <Text fw={600}>{n.title}</Text>
                {n.body ? <Text mt={4}>{n.body}</Text> : null}
                <Text size="sm" c="dimmed" mt={6}>{fmtDateTime(n.created_at)}</Text>
              </div>
              {!n.read_at ? <Text size="sm" c="violet" fw={500}>Nuevo</Text> : null}
            </Group>
          </Card>
        </UnstyledButton>
      ))}
    </Stack>
  );
}
