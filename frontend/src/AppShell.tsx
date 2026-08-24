import React, { useEffect, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import {
  AppShell as MantineAppShell,
  Group,
  NavLink as MantineNavLink,
  Title,
  Alert,
  Text,
  Stack,
  Anchor,
  UnstyledButton,
  Box,
  ActionIcon,
  Tooltip,
  useMantineColorScheme,
  useComputedColorScheme,
  Burger,
} from "@mantine/core";
import {
  IconLayoutDashboard,
  IconUsers,
  IconTool,
  IconCash,
  IconFileInvoice,
  IconCreditCard,
  IconServer,
  IconPackage,
  IconClock,
  IconFileText,
  IconSettings,
  IconSun,
  IconMoon,
  IconMenu2,
} from "@tabler/icons-react";
import { api, setToken } from "./api";
import { formatApiError } from "./format";
import { BrandLogo } from "./BrandLogo";
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
import InstallationsPage from "./pages/InstallationsPage";

function getPageHeading(pathname: string): { kicker?: string; kickerTo?: string; title: string | null } {
  const path = pathname === "/" ? "/dashboard" : pathname;
  if (path === "/clients/new") return { kicker: "Clientes", kickerTo: "/clients", title: "Nuevo cliente" };
  if (/^\/clients\/[^/]+/.test(path)) return { kicker: "Clientes", kickerTo: "/clients", title: null };
  if (path.startsWith("/clients")) return { kicker: "Gestión", title: "Clientes" };
  if (path.startsWith("/dashboard")) return { kicker: "Panel", title: "Resumen" };
  if (path.startsWith("/installations")) return { kicker: "Operación", title: "Instalaciones" };
  if (path.startsWith("/billing")) return { kicker: "Operación", title: "Cobranza" };
  if (path.startsWith("/invoices")) return { kicker: "Facturación", title: "Facturas" };
  if (path.startsWith("/payments")) return { kicker: "Facturación", title: "Pagos" };
  if (path.startsWith("/network")) return { kicker: "Infraestructura", title: "Red" };
  if (path.startsWith("/plans")) return { kicker: "Infraestructura", title: "Planes" };
  if (path.startsWith("/jobs")) return { kicker: "Sistema", title: "Tareas" };
  if (path.startsWith("/logs")) return { kicker: "Sistema", title: "Logs" };
  if (path.startsWith("/settings")) return { kicker: "Sistema", title: "Configuración" };
  return { title: "Panel" };
}

const NAV_ITEMS: { to: string; id: string; label: string; icon: React.ComponentType<{ size?: number | string; stroke?: number | string }> }[] = [
  { to: "/dashboard", id: "dashboard", label: "Inicio", icon: IconLayoutDashboard },
  { to: "/clients", id: "clients", label: "Clientes", icon: IconUsers },
  { to: "/installations", id: "installations", label: "Instalaciones", icon: IconTool },
  { to: "/billing", id: "billing", label: "Cobranza", icon: IconCash },
  { to: "/invoices", id: "invoices", label: "Facturas", icon: IconFileInvoice },
  { to: "/payments", id: "payments", label: "Pagos", icon: IconCreditCard },
  { to: "/network", id: "network", label: "Red", icon: IconServer },
  { to: "/plans", id: "plans", label: "Planes", icon: IconPackage },
  { to: "/jobs", id: "jobs", label: "Tareas / Crons", icon: IconClock },
  { to: "/logs", id: "logs", label: "Logs", icon: IconFileText },
  { to: "/settings", id: "settings", label: "Configuración", icon: IconSettings },
];

export default function AppShell(props: { onLogout: () => void }) {
  const [me, setMe] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [safety, setSafety] = useState<{
    mikrotik_writes_disabled?: boolean;
    prod_host_overlap?: string[];
    servers_with_real_credentials?: number;
  } | null>(null);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("sc.sidebarCollapsed") === "1");
  const [mobileOpened, setMobileOpened] = useState(false);
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
      .catch((e: unknown) => setError(formatApiError(e)));
  }, []);

  useEffect(() => {
    api
      .getSafetyStatus()
      .then((res) => setSafety(res as typeof safety))
      .catch(() => setSafety(null));
  }, []);

  useEffect(() => {
    const onLoading = (e: CustomEvent) => {
      const p = Number(e?.detail?.pending ?? 0);
      setPending(Number.isFinite(p) ? p : 0);
    };
    window.addEventListener("sc:loading", onLoading as EventListener);
    return () => window.removeEventListener("sc:loading", onLoading as EventListener);
  }, []);

  const pageHeading = getPageHeading(loc.pathname);

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
        collapsed: { mobile: !mobileOpened, desktop: false },
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
            <Burger
              opened={mobileOpened}
              onClick={() => setMobileOpened((o) => !o)}
              hiddenFrom="sm"
              size="sm"
              aria-label="Abrir menú"
            />
            <ActionIcon
              variant="subtle"
              color="gray"
              size="lg"
              onClick={toggleCollapsed}
              visibleFrom="sm"
              aria-label="Contraer menú"
            >
              <IconMenu2 size={20} />
            </ActionIcon>
            <NavLink to="/dashboard" style={{ textDecoration: "none", color: "inherit" }}>
              Inicio
            </NavLink>
          </Group>
          <Group>
            <Tooltip label={computedColorScheme === "dark" ? "Modo claro" : "Modo oscuro"}>
              <ActionIcon variant="default" size="lg" onClick={() => toggleColorScheme()} aria-label="Cambiar tema">
                {computedColorScheme === "dark" ? <IconSun size={18} /> : <IconMoon size={18} />}
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
          <Tooltip label="SistemaConnect" position="right" disabled={!collapsed}>
            <UnstyledButton
              component={Link}
              to="/dashboard"
              aria-label="SistemaConnect"
              style={{
                display: "flex",
                justifyContent: collapsed ? "center" : "flex-start",
                width: "100%",
                padding: collapsed ? "8px 0" : "8px 12px",
              }}
            >
              <BrandLogo mark={collapsed ? 28 : 32} wordmark={!collapsed} wordmarkSize={18} />
            </UnstyledButton>
          </Tooltip>
        </MantineAppShell.Section>
        <MantineAppShell.Section grow mt="md">
          {NAV_ITEMS.map((t) => {
            const isActive = loc.pathname === "/" ? t.to === "/dashboard" : loc.pathname.startsWith(t.to);
            const Icon = t.icon;
            if (collapsed) {
              // Modo contraído: solo el ícono centrado (estilo barra de actividad),
              // sin la doble caja NavLink + ThemeIcon.
              return (
                <Tooltip key={t.id} label={t.label} position="right" withArrow>
                  <ActionIcon
                    component={NavLink}
                    to={t.to}
                    onClick={() => setMobileOpened(false)}
                    variant={isActive ? "light" : "subtle"}
                    color={isActive ? "violet" : "gray"}
                    size={40}
                    radius="md"
                    aria-label={t.label}
                    style={{ display: "flex", margin: "0 auto 6px" }}
                  >
                    <Icon size={22} stroke={2} />
                  </ActionIcon>
                </Tooltip>
              );
            }
            return (
              <Box key={t.id} mb={2}>
                <MantineNavLink
                  component={NavLink}
                  to={t.to}
                  onClick={() => setMobileOpened(false)}
                  label={t.label}
                  leftSection={<Icon size={20} stroke={2} />}
                  active={isActive}
                  style={{ borderRadius: "var(--mantine-radius-sm)" }}
                />
              </Box>
            );
          })}
        </MantineAppShell.Section>
      </MantineAppShell.Navbar>

      <MantineAppShell.Main>
        {pageHeading.title ? (
          <Stack gap={2} mb="lg">
            {pageHeading.kicker ? (
              pageHeading.kickerTo ? (
                <Anchor component={Link} to={pageHeading.kickerTo} size="sm" c="dimmed" underline="never">
                  {pageHeading.kicker}
                </Anchor>
              ) : (
                <Text size="sm" c="dimmed">{pageHeading.kicker}</Text>
              )
            ) : null}
            <Title order={2} fw={600} lh={1.2}>
              {pageHeading.title}
            </Title>
          </Stack>
        ) : pageHeading.kicker ? (
          <Anchor component={Link} to={pageHeading.kickerTo || "/clients"} size="sm" c="dimmed" underline="never" display="inline-block" mb="md">
            {pageHeading.kicker}
          </Anchor>
        ) : null}

        {safety?.mikrotik_writes_disabled ? (
          <Alert color="teal" variant="light" mb="md" title="Staging: Mikrotik en solo lectura">
            Cortes, altas/bajas PPPoE y sync de perfiles están bloqueados hacia el router.
          </Alert>
        ) : (safety?.prod_host_overlap?.length ?? 0) > 0 || (safety?.servers_with_real_credentials ?? 0) > 0 ? (
          <Alert color="orange" variant="light" mb="md" title="Atención: Mikrotik de producción">
            {(safety?.prod_host_overlap?.length ?? 0) > 0
              ? `Hosts de prod detectados: ${safety!.prod_host_overlap!.join(", ")}. `
              : ""}
            {(safety?.servers_with_real_credentials ?? 0) > 0
              ? "Hay credenciales API cargadas. "
              : ""}
            Activá MIKROTIK_WRITES_DISABLED en staging antes de migrar o sincronizar.
          </Alert>
        ) : null}

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
          <Route path="/installations" element={<InstallationsPage />} />
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
        <Group justify="center">
          <BrandLogo mark={20} wordmarkSize={14} />
        </Group>
      </MantineAppShell.Footer>
    </MantineAppShell>
  );
}
