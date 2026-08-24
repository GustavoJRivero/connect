import React from "react";
import {
  Card as MantineCard,
  Button as MantineButton,
  Badge,
  TextInput,
  Group,
  Title,
  Paper,
  type BadgeProps,
} from "@mantine/core";
import { invoiceStatusLabel } from "./format";

export function Card(props: {
  title?: string;
  header?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  headerRight?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <MantineCard withBorder padding="lg" radius="md" className={props.className}>
      {props.header !== undefined ? (
        <MantineCard.Section withBorder inheritPadding py="xs">
          {props.header}
        </MantineCard.Section>
      ) : props.title ? (
        <MantineCard.Section withBorder inheritPadding py="xs">
          <Group justify="space-between">
            <Title order={5}>{props.title}</Title>
            {props.headerRight ? <div>{props.headerRight}</div> : null}
          </Group>
        </MantineCard.Section>
      ) : null}
      <MantineCard.Section inheritPadding py="md">
        {props.children}
      </MantineCard.Section>
      {props.footer ? (
        <MantineCard.Section withBorder inheritPadding py="xs">
          {props.footer}
        </MantineCard.Section>
      ) : null}
    </MantineCard>
  );
}

export function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <TextInput
      label={props.label}
      value={props.value}
      onChange={(e) => props.onChange(e.currentTarget.value)}
      type={props.type ?? "text"}
      placeholder={props.placeholder}
      withAsterisk={props.required}
      maxLength={props.maxLength}
    />
  );
}

const variantMap = {
  primary: "filled",
  primaryLight: "light",
  danger: "filled",
  dangerLight: "light",
  dangerSubtle: "subtle",
  default: "light",
  secondary: "light",
  ghost: "subtle",
  info: "filled",
  warning: "filled",
} as const;

const colorMap = {
  primary: "violet",
  primaryLight: "violet",
  danger: "red",
  dangerLight: "red",
  dangerSubtle: "red",
  default: "gray",
  secondary: "gray",
  ghost: "gray",
  info: "cyan",
  warning: "yellow",
} as const;

export function Button(props: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "primaryLight" | "danger" | "dangerLight" | "dangerSubtle" | "default" | "secondary" | "ghost" | "info" | "warning";
  disabled?: boolean;
  loading?: boolean;
}) {
  const variant = variantMap[props.variant ?? "default"];
  const color = colorMap[props.variant ?? "default"];
  return (
    <MantineButton
      type={props.type ?? "button"}
      disabled={props.disabled}
      loading={props.loading}
      onClick={props.onClick}
      variant={variant}
      color={color}
      size="sm"
    >
      {props.children}
    </MantineButton>
  );
}

export function CodeBlock({ data }: { data: unknown }) {
  return (
    <Paper p="md" radius="sm" withBorder style={{ overflow: "auto" }}>
      <pre style={{ margin: 0 }}>{JSON.stringify(data, null, 2)}</pre>
    </Paper>
  );
}

// ---------------------------------------------------------------------------
// Badges muted (misma paleta en toda la app)
// ---------------------------------------------------------------------------

export type BadgeTone = "lilac" | "green" | "red" | "gray" | "yellow" | "orange";

function toneVars(lightColor: string, darkColor: string, lightBg: string, darkBg: string): React.CSSProperties {
  return {
    color: `light-dark(${lightColor}, ${darkColor})`,
    background: `light-dark(${lightBg}, ${darkBg})`,
    ["--badge-color" as string]: `light-dark(${lightColor}, ${darkColor})`,
    ["--badge-bg" as string]: `light-dark(${lightBg}, ${darkBg})`,
    ["--badge-bd" as string]: "transparent",
  };
}

const TONE_STYLE: Record<BadgeTone, { color: string; style?: React.CSSProperties }> = {
  lilac: {
    color: "violet",
    style: toneVars("#563782", "#e8dcf4", "rgba(122, 79, 176, 0.14)", "rgba(122, 79, 176, 0.22)"),
  },
  green: {
    color: "teal",
    style: toneVars("#2d6a4f", "#a8d4bc", "rgba(79, 138, 104, 0.16)", "rgba(79, 138, 104, 0.14)"),
  },
  red: {
    color: "red",
    style: toneVars("#8b3a3a", "#c47a7a", "rgba(139, 77, 77, 0.12)", "rgba(139, 77, 77, 0.12)"),
  },
  yellow: {
    color: "yellow",
    style: toneVars("#7a6520", "#d4c48a", "rgba(180, 150, 60, 0.14)", "rgba(180, 150, 60, 0.12)"),
  },
  orange: {
    color: "orange",
    style: toneVars("#9a5520", "#e0b08a", "rgba(200, 120, 50, 0.14)", "rgba(200, 120, 50, 0.16)"),
  },
  gray: { color: "gray" },
};

/** ActionIcon de corte: filled muted, no el rojo default de Mantine. */
export const MUTED_DISCONNECT_STYLE: React.CSSProperties = {
  background: "rgba(180, 72, 72, 0.72)",
  color: "#f0d4d4",
};

type MutedBadgeProps = {
  tone?: BadgeTone;
  size?: BadgeProps["size"];
  children: React.ReactNode;
  style?: React.CSSProperties;
  mr?: BadgeProps["mr"];
  ml?: BadgeProps["ml"];
  leftSection?: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
};

export function MutedBadge({ tone = "gray", style, children, ...rest }: MutedBadgeProps) {
  const t = TONE_STYLE[tone] ?? TONE_STYLE.gray;
  return (
    <Badge variant="light" color={t.color} tt="none" fw={500} style={{ ...t.style, ...style }} {...rest}>
      {children}
    </Badge>
  );
}

export function badgeToneFromColor(color?: string | null): BadgeTone {
  const c = String(color ?? "").toLowerCase();
  if (c === "green" || c === "teal") return "green";
  if (c === "red") return "red";
  if (c === "yellow") return "yellow";
  if (c === "orange") return "orange";
  if (c === "violet" || c === "grape" || c === "purple") return "lilac";
  return "gray";
}

export function invoiceStatusTone(status?: string | null): BadgeTone {
  const s = String(status ?? "").toUpperCase();
  if (s === "PAID") return "green";
  if (s === "UNPAID") return "yellow";
  if (s === "OVERDUE" || s === "CANCELLED" || s === "VOID") return "red";
  return "gray";
}

export function InvoiceStatusBadge({
  status,
  size = "lg",
  ...rest
}: { status?: string | null } & Omit<MutedBadgeProps, "tone" | "children">) {
  return (
    <MutedBadge size={size} tone={invoiceStatusTone(status)} {...rest}>
      {invoiceStatusLabel(status)}
    </MutedBadge>
  );
}

export function connectionStatusTone(status?: string | null): BadgeTone {
  const s = String(status ?? "").toUpperCase();
  if (s === "CUT") return "red";
  if (s === "ACTIVE") return "green";
  return "gray";
}

export function jobStatusTone(status?: string | null): BadgeTone {
  const s = String(status ?? "").toUpperCase();
  if (s === "DONE" || s === "COMPLETED") return "green";
  if (s === "FAILED") return "red";
  if (s === "RUNNING") return "lilac";
  if (s === "PENDING") return "yellow";
  return "gray";
}

export function complaintStatusTone(status?: string | null): BadgeTone {
  const s = String(status ?? "").toUpperCase();
  if (s === "SOLVED") return "green";
  if (s === "WIP") return "lilac";
  if (s === "TODO" || s === "PENDING") return "orange";
  return "gray";
}

export function clientServicesTone(clientStatus?: string | null, servicesStatus?: string | null): BadgeTone {
  if (String(clientStatus ?? "").toUpperCase() === "RETIRED") return "gray";
  const s = String(servicesStatus ?? "").toUpperCase();
  if (s === "SUSPENDED") return "red";
  if (s === "ACTIVE") return "green";
  return "gray";
}

export function installationStatusTone(status?: string | null): BadgeTone {
  const s = String(status ?? "").toUpperCase();
  if (s === "INSTALADA") return "green";
  if (s === "VENCIDA") return "red";
  if (s === "RESERVADO") return "lilac";
  if (s === "SIN_COBERTURA") return "yellow";
  return "gray";
}

export function logLevelTone(level?: string | null): BadgeTone {
  const s = String(level ?? "").toUpperCase();
  if (s === "ERROR") return "red";
  if (s === "WARNING") return "yellow";
  if (s === "INFO") return "lilac";
  return "gray";
}
