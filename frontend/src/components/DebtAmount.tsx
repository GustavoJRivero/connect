import React from "react";
import { Stack, Text } from "@mantine/core";
import { MutedBadge } from "../ui";
import { fmtMoney } from "../format";

export function DebtAmount(props: { value: unknown; creditValue?: unknown; unpaidCount?: unknown }) {
  const n = Number(props.value ?? 0);
  const credit = Number(props.creditValue ?? 0);
  if (!Number.isFinite(n) || n <= 0) {
    if (Number.isFinite(credit) && credit > 0) {
      return <MutedBadge tone="green">A favor {fmtMoney(credit)}</MutedBadge>;
    }
    return <MutedBadge tone="gray">Al día</MutedBadge>;
  }
  const unpaid = Number(props.unpaidCount ?? 0);
  return (
    <Stack gap={2} align="flex-start">
      <MutedBadge tone="red">-{fmtMoney(n)}</MutedBadge>
      {unpaid > 0 && (
        <Text size="xs" c="dimmed">
          {unpaid === 1 ? "1 factura impaga" : `${unpaid} facturas impagas`}
        </Text>
      )}
    </Stack>
  );
}

export type DebtFilter = "all" | "debtors" | "current";

export const DEBT_FILTER_OPTIONS: { value: DebtFilter; label: string }[] = [
  { value: "all", label: "Todos los saldos" },
  { value: "debtors", label: "Solo deudores" },
  { value: "current", label: "Solo al día" },
];
