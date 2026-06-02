import React, { useEffect, useState } from "react";
import { Badge, Group, SegmentedControl, Select, Stack, Text } from "@mantine/core";
import { api } from "../api";
import { Field } from "../ui";

type Pool = {
  cidr: string;
  valid: boolean;
  total: number;
  assigned: string[];
  reserved: string[];
  available: string[];
  next_available: string | null;
  truncated: boolean;
};

type PoolSummary = {
  valid: boolean;
  cidrs: string[];
  pools: Pool[];
  total: number;
  assigned_count: number;
  reserved_count: number;
  available_count: number;
  next_available: string | null;
};

export function IpPoolPicker(props: {
  serverId: number | null;
  /** IP que el usuario carga manualmente (estado externo). */
  ip: string;
  onChange: (ip: string) => void;
  mode: "auto" | "manual";
  onModeChange: (mode: "auto" | "manual") => void;
  /** Si está editando una conexión existente, ignoramos esa IP al calcular "tomadas". */
  excludeIp?: string;
  label?: string;
}) {
  const [summary, setSummary] = useState<PoolSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!props.serverId) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .getServerPool(Number(props.serverId), 256)
      .then((res: unknown) => {
        if (cancelled) return;
        setSummary(res as PoolSummary);
      })
      .catch(() => {
        if (cancelled) return;
        setSummary(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [props.serverId]);

  // Cuando cambia a auto, limpia la IP manual.
  useEffect(() => {
    if (props.mode === "auto" && props.ip) {
      props.onChange("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.mode]);

  // Datos agrupados para el Select: un grupo por CIDR.
  const selectGroups = React.useMemo(() => {
    if (!summary) return [] as { group: string; items: { value: string; label: string }[] }[];
    const groups = summary.pools.map((p) => {
      const items = p.available.map((ip) => ({ value: ip, label: ip }));
      // Si la IP propia (al editar) o la actualmente cargada cae en este pool y no está en libres, la agregamos.
      const ownIps = [props.excludeIp, props.ip].filter(Boolean) as string[];
      for (const ip of ownIps) {
        if (!ip) continue;
        if (!items.find((it) => it.value === ip) && p.assigned.includes(ip)) {
          items.push({ value: ip, label: `${ip} (actual)` });
        }
      }
      return { group: p.cidr, items };
    });
    return groups.filter((g) => g.items.length > 0);
  }, [summary, props.ip, props.excludeIp]);

  const totalAvailable = summary?.available_count ?? 0;

  return (
    <Stack gap={4} mt="sm">
      <Group justify="space-between" align="center">
        <Text size="sm" fw={500}>{props.label ?? "IP del cliente"}</Text>
        <SegmentedControl
          size="xs"
          value={props.mode}
          onChange={(v) => props.onModeChange((v as "auto" | "manual") || "auto")}
          data={[
            { value: "auto", label: "Automática" },
            { value: "manual", label: "Manual" },
          ]}
        />
      </Group>
      {!props.serverId ? (
        <Text size="xs" c="dimmed">Seleccioná primero un servidor para ver el pool.</Text>
      ) : loading ? (
        <Text size="xs" c="dimmed">Cargando pool…</Text>
      ) : !summary || !summary.valid ? (
        <Text size="xs" c="dimmed">
          Este server no tiene pools configurados.{" "}
          {props.mode === "auto"
            ? "Se creará el secret sin remote-address."
            : "Cargá la IP manualmente."}
          {props.mode === "manual" ? (
            <Field
              label="IP"
              value={props.ip}
              onChange={props.onChange}
              placeholder="ej: 192.168.1.50"
            />
          ) : null}
        </Text>
      ) : props.mode === "auto" ? (
        <Stack gap={4}>
          <Group gap="xs" wrap="wrap">
            <Badge
              variant="light"
              color={summary.next_available ? "green" : "red"}
              size="sm"
            >
              {summary.next_available
                ? `Se asignará ${summary.next_available}`
                : "Sin IPs libres"}
            </Badge>
            <Text size="xs" c="dimmed">
              ({summary.assigned_count} usadas / {summary.total} total / {totalAvailable} libres)
            </Text>
          </Group>
          <Group gap={4} wrap="wrap">
            {summary.pools.map((p) => (
              <Badge key={p.cidr} variant="light" color="gray" size="xs">
                {p.cidr}: {p.assigned.length}/{p.total}
              </Badge>
            ))}
          </Group>
        </Stack>
      ) : (
        <>
          <Select
            label="Elegir IP libre"
            placeholder="Buscar / seleccionar"
            searchable
            clearable
            data={selectGroups}
            value={props.ip || null}
            onChange={(v) => props.onChange(v || "")}
            nothingFoundMessage={totalAvailable === 0 ? "Pools sin IPs libres" : "Sin coincidencias"}
          />
          <Field
            label="…o tipearla manualmente"
            value={props.ip}
            onChange={props.onChange}
            placeholder="ej: 10.0.0.50"
          />
        </>
      )}
    </Stack>
  );
}
