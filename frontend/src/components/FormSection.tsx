import React from "react";
import { Group, Paper, Stack, Text, ThemeIcon } from "@mantine/core";

export function FormSection(props: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return (
    <Paper withBorder radius="md" p="md">
      <Group gap="sm" wrap="nowrap" mb="md">
        <ThemeIcon size={36} radius="md" variant="light" color="violet">
          {props.icon}
        </ThemeIcon>
        <div>
          <Text fw={600} size="sm">{props.title}</Text>
          <Text size="xs" c="dimmed">{props.description}</Text>
        </div>
      </Group>
      <Stack gap="sm">{props.children}</Stack>
    </Paper>
  );
}
