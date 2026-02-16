import React from "react";
import {
  Card as MantineCard,
  Button as MantineButton,
  TextInput,
  Group,
  Title,
  Paper,
} from "@mantine/core";

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
}) {
  return (
    <TextInput
      label={props.label}
      value={props.value}
      onChange={(e) => props.onChange(e.currentTarget.value)}
      type={props.type ?? "text"}
      placeholder={props.placeholder}
    />
  );
}

const variantMap = {
  primary: "filled",
  danger: "filled",
  default: "light",
  secondary: "light",
  ghost: "subtle",
  info: "filled",
  warning: "filled",
} as const;

const colorMap = {
  primary: "blue",
  danger: "red",
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
  variant?: "primary" | "danger" | "default" | "secondary" | "ghost" | "info" | "warning";
  disabled?: boolean;
}) {
  const variant = variantMap[props.variant ?? "default"];
  const color = colorMap[props.variant ?? "default"];
  return (
    <MantineButton
      type={props.type ?? "button"}
      disabled={props.disabled}
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
