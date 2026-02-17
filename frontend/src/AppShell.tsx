import React, { useEffect, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import {
  AppShell as MantineAppShell,
  Group,
  NavLink as MantineNavLink,
  Title,
  Breadcrumbs,
  Alert,
  UnstyledButton,
  Box,
  ActionIcon,
  Tooltip,
  useMantineColorScheme,
  useComputedColorScheme,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { api, setToken } from "./api";
import { Button } from "./ui";

import ClientsPage from "./pages/ClientsPage";
import DashboardPage from "./pages/DashboardPage";
import BillingPage from "./pages/BillingPage";
import InvoicesPage from "./pages/InvoicesPage";
import PaymentsPage from "./pages/PaymentsPage";
import SettingsPage from "./pages/SettingsPage";
import NetworkPage from "./pages/NetworkPage";
import PlansPage from "./pages/PlansPage";
import LogsPage from "./pages/LogsPage";
import JobsPage from "./pages/JobsPage";

const NAV_ITEMS: { to: string; id: string; label: string; icon: string }[] = [
  { to: "/dashboard", id: "dashboard", label: "Dashboard", icon: "📊" },
  { to: "/clients", id: "clients", label: "Clientes", icon: "👥" },
  { to: "/billing", id: "billing", label: "Cobranza", icon: "💰" },
  { to: "/invoices", id: "invoices", label: "Facturas", icon: "📄" },
  { to: "/payments", id: "payments", label: "Pagos", icon: "💵" },
  { to: "/network", id: "network", label: "Red", icon: "🌐" },
  { to: "/plans", id: "plans", label: "Planes", icon: "📋" },
  { to: "/jobs", id: "jobs", label: "Jobs / Crons", icon: "🔧" },
  { to: "/logs", id: "logs", label: "Logs", icon: "📜" },
  { to: "/settings", id: "settings", label: "Configuración", icon: "⚙️" },
];

export default function AppShell(props: { onLogout: () => void }) {
  const [me, setMe] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("sc.sidebarCollapsed") === "1");
  const loc = useLocation();
  const { toggleColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme("light");

  useEffect(() => {
    const next = localStorage.getItem("sc.sidebarCollapsed") === "1";
    setCollapsed(next);
  }, []);

  useEffect(() => {
    api
      .me()
      .then(setMe)
      .catch((e: { status?: number; body?: unknown }) => setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`));
  }, []);

  useEffect(() => {
    const onLoading = (e: CustomEvent) => {
      const p = Number(e?.detail?.pending ?? 0);
      setPending(Number.isFinite(p) ? p : 0);
    };
    window.addEventListener("sc:loading", onLoading as EventListener);
    return () => window.removeEventListener("sc:loading", onLoading as EventListener);
  }, []);

  const currentTitle =
    NAV_ITEMS.find((t) => (loc.pathname === "/" ? "/dashboard" : loc.pathname).startsWith(t.to))?.label ?? "Panel";

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sc.sidebarCollapsed", next ? "1" : "0");
  };

  return (
    <MantineAppShell
      header={{ height: 56 }}
      navbar={{
        width: collapsed ? 60 : 220,
        breakpoint: "sm",
        collapsed: { mobile: true },
      }}
      padding="md"
    >
      {pending > 0 ? (
        <Box pos="absolute" left={0} right={0} top={0} h={3} style={{ zIndex: 1055 }} className="sc-progress-top">
          <div className="sc-progress-top-bar" />
        </Box>
      ) : null}

      <MantineAppShell.Header>
        <Group h="100%" justify="space-between" px="md">
          <Group>
            <UnstyledButton onClick={toggleCollapsed} style={{ fontSize: 20 }}>
              ≡
            </UnstyledButton>
            <NavLink to="/dashboard" style={{ textDecoration: "none", color: "inherit" }}>
              Home
            </NavLink>
          </Group>
          <Group>
            <Tooltip label={computedColorScheme === "dark" ? "Modo claro" : "Modo oscuro"}>
              <ActionIcon variant="default" size="lg" onClick={() => toggleColorScheme()} aria-label="Cambiar tema">
                {computedColorScheme === "dark" ? "☀️" : "🌙"}
              </ActionIcon>
            </Tooltip>
            <span>{me && typeof me === "object" && "username" in me ? String((me as { username: string }).username) : "..."}</span>
            <Button
              variant="danger"
              onClick={() => {
                setToken(null);
                props.onLogout();
              }}
            >
              Salir
            </Button>
          </Group>
        </Group>
      </MantineAppShell.Header>

      <MantineAppShell.Navbar p="xs">
        <MantineAppShell.Section>
          <Tooltip label="Inicio" position="right" disabled={!collapsed}>
            <UnstyledButton
              component={Link}
              to="/dashboard"
              style={{
                fontWeight: 600,
                fontSize: collapsed ? "1rem" : "1.1rem",
                display: "block",
                width: "100%",
                textAlign: collapsed ? "center" : "left",
                padding: collapsed ? "8px" : "8px 12px",
              }}
            >
              {collapsed ? "SC" : "SistemaConnect"}
            </UnstyledButton>
          </Tooltip>
        </MantineAppShell.Section>
        <MantineAppShell.Section grow mt="md">
          {NAV_ITEMS.map((t) => {
            const isActive = loc.pathname === "/" ? t.to === "/dashboard" : loc.pathname.startsWith(t.to);
            if (collapsed) {
              return (
                <Tooltip key={t.id} label={t.label} position="right" withArrow>
                  <Box style={{ marginBottom: 2 }}>
                    <MantineNavLink
                      component={NavLink}
                      to={t.to}
                      leftSection={<ThemeIcon variant="light" size="md" style={{ minWidth: 36, minHeight: 36 }}>{t.icon}</ThemeIcon>}
                      active={isActive}
                      style={{ borderRadius: "var(--mantine-radius-sm)" }}
                    />
                  </Box>
                </Tooltip>
              );
            }
            return (
              <Box key={t.id} mb={2}>
                <MantineNavLink
                  component={NavLink}
                  to={t.to}
                  label={t.label}
                  leftSection={<Text span style={{ fontSize: "1.1em" }}>{t.icon}</Text>}
                  active={isActive}
                  style={{ borderRadius: "var(--mantine-radius-sm)" }}
                />
              </Box>
            );
          })}
        </MantineAppShell.Section>
      </MantineAppShell.Navbar>

      <MantineAppShell.Main>
        <Group justify="space-between" mb="md">
          <Title order={3}>{currentTitle}</Title>
          <Breadcrumbs>
            <Link to="/dashboard" style={{ color: "var(--mantine-color-dimmed)" }}>Home</Link>
            <span>{currentTitle}</span>
          </Breadcrumbs>
        </Group>

        {error ? (
          <Alert color="red" mb="md" className="sc-error">
            {error}
          </Alert>
        ) : null}

        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/clients/new" element={<ClientsPage />} />
          <Route path="/clients/:clientId" element={<ClientsPage />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/network" element={<NetworkPage />} />
          <Route path="/network/:serverId" element={<NetworkPage />} />
          <Route path="/plans" element={<PlansPage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </MantineAppShell.Main>

      <MantineAppShell.Footer p="xs">
        <Group justify="space-between">
          <span>SistemaConnect</span>
          <span>ISP Admin</span>
        </Group>
      </MantineAppShell.Footer>
    </MantineAppShell>
  );
}
