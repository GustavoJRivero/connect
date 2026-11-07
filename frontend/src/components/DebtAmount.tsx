import React from "react";
import { MutedBadge } from "../ui";
import { fmtMoney } from "../format";

export function DebtAmount(props: { value: unknown; creditValue?: unknown }) {
  const n = Number(props.value ?? 0);
  const credit = Number(props.creditValue ?? 0);
  if (!Number.isFinite(n) || n <= 0) {
    if (Number.isFinite(credit) && credit > 0) {
      return <MutedBadge tone="green">A favor {fmtMoney(credit)}</MutedBadge>;
    }
    return <MutedBadge tone="gray">Al día</MutedBadge>;
  }
  return <MutedBadge tone="red">Debe {fmtMoney(n)}</MutedBadge>;
}

export type DebtFilter = "all" | "debtors" | "current";

export const DEBT_FILTER_OPTIONS: { value: DebtFilter; label: string }[] = [
  { value: "all", label: "Todos los saldos" },
  { value: "debtors", label: "Solo deudores" },
  { value: "current", label: "Solo al día" },
];
