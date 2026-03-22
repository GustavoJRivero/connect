import React, { useEffect, useState } from "react";
import { Route, Routes, Navigate } from "react-router-dom";
import {
  AppShell,
  Group,
  Text,
  Button,
  Box,
  useMantineColorScheme,
  useComputedColorScheme,
  ActionIcon,
  Tooltip,
} from "@mantine/core";
import { api, setToken } from "./api";
import ClientInvoicesPage from "./pages/ClientInvoicesPage";
import MercadoPagoReturnPage from "./pages/MercadoPagoReturnPage";

export default function ClientPortalShell(props: { onLogout: () => void }) {
  const [clientName, setClientName] = useState<string>("");
  const { toggleColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme("light");

  useEffect(() => {
    api
      .getPortalMe()
      .then((res: any) => setClientName(res?.full_name ?? ""))
      .catch(() => {});
  }, []);

  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group h="100%" justify="space-between" px="md">
          <Text fw={700} size="lg">
            SistemaConnect
          </Text>
          <Group>
            <Tooltip label={computedColorScheme === "dark" ? "Modo claro" : "Modo oscuro"}>
              <ActionIcon variant="default" size="lg" onClick={() => toggleColorScheme()} aria-label="Cambiar tema">
                {computedColorScheme === "dark" ? "☀️" : "🌙"}
              </ActionIcon>
            </Tooltip>
            {clientName ? <Text size="sm">{clientName}</Text> : null}
            <Button
              variant="light"
              color="red"
              size="sm"
              onClick={() => {
                setToken(null);
                props.onLogout();
              }}
            >
              Salir
            </Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Box maw={720} mx="auto" pt="md">
          <Routes>
            <Route path="/" element={<Navigate to="/invoices" replace />} />
            <Route path="/invoices" element={<ClientInvoicesPage />} />
            <Route path="/payment/success" element={<MercadoPagoReturnPage status="success" />} />
            <Route path="/payment/pending" element={<MercadoPagoReturnPage status="pending" />} />
            <Route path="/payment/failure" element={<MercadoPagoReturnPage status="failure" />} />
            <Route path="*" element={<Navigate to="/invoices" replace />} />
          </Routes>
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}
