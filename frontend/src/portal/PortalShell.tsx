import React, { useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ActionIcon, Badge, Group, Text, UnstyledButton, Box } from "@mantine/core";
import {
  IconBell,
  IconFileInvoice,
  IconHeadset,
  IconHome,
  IconLogout,
  IconWifi,
} from "@tabler/icons-react";
import { BrandLogo } from "../BrandLogo";
import { setPortalToken } from "./api";
import { PortalErrorBoundary } from "./ErrorBoundary";
import "./portal.css";

export type PortalOutletContext = { onRefresh: () => void };

const NAV = [
  { to: "/portal", end: true, label: "Inicio", icon: IconHome },
  { to: "/portal/invoices", label: "Facturas", icon: IconFileInvoice },
  { to: "/portal/connection", label: "Internet", icon: IconWifi },
  { to: "/portal/complaints", label: "Ayuda", icon: IconHeadset },
  { to: "/portal/notices", label: "Avisos", icon: IconBell },
];

export function PortalShell(props: {
  onLogout: () => void;
  name: string;
  unread: number;
  onRefresh: () => void;
}) {
  const loc = useLocation();
  const navigate = useNavigate();
  const first = props.name.split(" ")[0] || "vos";

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  return (
    <div className="portal-app">
      <header className="portal-top">
        <div className="portal-top-inner">
          <BrandLogo mark={28} wordmarkSize={18} />
          <Group gap={8}>
            <Box pos="relative">
              <ActionIcon variant="subtle" color="violet" size="lg" onClick={() => navigate("/portal/notices")} aria-label="Avisos">
                <IconBell size={20} />
              </ActionIcon>
              {props.unread > 0 ? (
                <Badge size="xs" color="violet" circle style={{ position: "absolute", top: 0, right: 0 }}>
                  {props.unread > 9 ? "9+" : props.unread}
                </Badge>
              ) : null}
            </Box>
            <UnstyledButton onClick={() => { setPortalToken(null); props.onLogout(); }}>
              <Group gap={6}>
                <IconLogout size={16} />
                <Text size="sm">Salir</Text>
              </Group>
            </UnstyledButton>
          </Group>
        </div>
      </header>

      <main className="portal-wrap">
        {loc.pathname === "/portal" || loc.pathname === "/portal/" ? (
          <Text c="dimmed" mb={4} fw={500}>Hola, {first}</Text>
        ) : null}
        <PortalErrorBoundary>
          <Outlet context={{ onRefresh: props.onRefresh } as PortalOutletContext} />
        </PortalErrorBoundary>
      </main>

      <nav className="portal-bottom">
        <div className="portal-bottom-inner">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `portal-tab${isActive ? " active" : ""}`}
            >
              <span style={{ position: "relative", display: "inline-flex" }}>
                <item.icon size={20} stroke={1.8} />
                {item.to === "/portal/notices" && props.unread > 0 ? (
                  <Badge size="xs" color="violet" variant="filled" circle style={{ position: "absolute", top: -6, right: -8 }}>
                    {props.unread > 9 ? "9+" : props.unread}
                  </Badge>
                ) : null}
              </span>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
