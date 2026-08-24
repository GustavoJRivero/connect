import React, { useEffect, useState } from "react";
import { Alert, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { Card, MutedBadge, connectionStatusTone } from "../../ui";
import { connectionStatusLabel, formatApiError } from "../../format";
import { portalApi } from "../api";

export function PortalConnection() {
  const [items, setItems] = useState<any[]>([]);
  const [me, setMe] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([portalApi.connections(), portalApi.me()])
      .then(([conns, profile]) => {
        setItems(conns);
        setMe(profile);
      })
      .catch((e) => setError(formatApiError(e)));
  }, []);

  if (error) return <Alert color="red">{error}</Alert>;

  return (
    <Stack gap="lg">
      <Title order={2} fw={700}>Tu internet</Title>
      {me ? (
        <Card title="Titular">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <div>
              <Text size="sm" c="dimmed">Nombre</Text>
              <Text>{me.full_name}</Text>
            </div>
            <div>
              <Text size="sm" c="dimmed">{me.kind === "COMPANY" ? "CUIT" : "DNI"}</Text>
              <Text>{me.dni || me.cuit || "—"}</Text>
            </div>
            <div>
              <Text size="sm" c="dimmed">Teléfono</Text>
              <Text>{me.phone || "—"}</Text>
            </div>
            <div>
              <Text size="sm" c="dimmed">Email</Text>
              <Text>{me.email || "—"}</Text>
            </div>
            <div>
              <Text size="sm" c="dimmed">Dirección</Text>
              <Text>{me.address || "—"}</Text>
            </div>
          </SimpleGrid>
        </Card>
      ) : null}
      {!items.length ? <Text c="dimmed">No hay conexiones cargadas.</Text> : null}
      {items.map((c) => (
        <Card key={c.id} title={`Conexión ${c.pppoe_name || c.id}`}>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <div>
              <Text size="sm" c="dimmed">Plan</Text>
              <MutedBadge tone="lilac" size="lg">{c.plan_profile || "—"}</MutedBadge>
            </div>
            <div>
              <Text size="sm" c="dimmed">Estado</Text>
              <MutedBadge tone={connectionStatusTone(c.status)} size="lg">{connectionStatusLabel(c.status)}</MutedBadge>
            </div>
            <div>
              <Text size="sm" c="dimmed">Domicilio del servicio</Text>
              <Text>{c.service_address || "—"}</Text>
            </div>
            <div>
              <Text size="sm" c="dimmed">IP</Text>
              <Text>{c.ip || "—"}</Text>
            </div>
            <div>
              <Text size="sm" c="dimmed">Usuario PPPoE</Text>
              <Text>{c.pppoe_name || "—"}</Text>
            </div>
            <div>
              <Text size="sm" c="dimmed">Día de facturación</Text>
              <Text>{c.billing_day || "—"}</Text>
            </div>
          </SimpleGrid>
        </Card>
      ))}
    </Stack>
  );
}
