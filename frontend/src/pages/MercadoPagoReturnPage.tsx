import React, { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Alert, Button, Card, Stack, Text, Title, Loader, Center } from "@mantine/core";

type ReturnStatus = "success" | "pending" | "failure";

function statusConfig(status: ReturnStatus) {
  switch (status) {
    case "success":
      return {
        color: "green" as const,
        title: "Pago recibido",
        message:
          "Tu pago fue procesado correctamente. En unos instantes tu servicio quedará al día.",
        icon: "✅",
      };
    case "pending":
      return {
        color: "yellow" as const,
        title: "Pago pendiente",
        message:
          "Tu pago está siendo procesado. Te notificaremos cuando se confirme. No realices un nuevo pago.",
        icon: "⏳",
      };
    case "failure":
      return {
        color: "red" as const,
        title: "Pago no completado",
        message:
          "El pago no pudo completarse. Podés intentarlo nuevamente desde la sección Facturas.",
        icon: "❌",
      };
  }
}

interface Props {
  status: ReturnStatus;
}

export default function MercadoPagoReturnPage({ status }: Props) {
  const [params] = useSearchParams();
  const prefId = params.get("pref");
  const cfg = statusConfig(status);

  return (
    <Center h="100vh" style={{ background: "var(--mantine-color-body)" }}>
      <Card withBorder shadow="md" p="xl" radius="md" w={420}>
        <Stack align="center" gap="md">
          <Text fz={48}>{cfg.icon}</Text>
          <Title order={3} ta="center">
            {cfg.title}
          </Title>
          <Alert color={cfg.color} variant="light" w="100%">
            {cfg.message}
          </Alert>
          {prefId && (
            <Text c="dimmed" fz="xs">
              Referencia: #{prefId}
            </Text>
          )}
          <Button component={Link} to="/invoices" variant="light" mt="sm">
            Volver a Facturas
          </Button>
        </Stack>
      </Card>
    </Center>
  );
}
