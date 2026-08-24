import React, { useEffect, useRef, useState } from "react";
import { Select } from "@mantine/core";
import { api } from "../api";

type ClientOption = { value: string; label: string };

/**
 * Selector de cliente con búsqueda server-side (nombre, DNI/CUIT, teléfono, email o ID).
 * Evita tener que saber el ID de memoria: escribí parte del nombre y elegí de la lista.
 */
export function ClientSelect(props: {
  label?: string;
  value: string; // id del cliente como string, "" = sin selección
  onChange: (clientId: string) => void;
  required?: boolean;
  clearable?: boolean;
  placeholder?: string;
}) {
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(false);
  // Cache de la opción seleccionada para que el Select muestre el label aunque cambie la búsqueda.
  const selectedRef = useRef<ClientOption | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = (await api.listClients({ q: search || "", limit: 20, offset: 0, sort_by: "full_name", sort_dir: "asc" })) as
          | { items?: { id: number; full_name?: string; dni?: string; cuit?: string }[] }
          | { id: number; full_name?: string }[];
        const list = Array.isArray(res) ? res : res?.items ?? [];
        const opts = (list as { id: number; full_name?: string; dni?: string; cuit?: string }[]).map((c) => ({
          value: String(c.id),
          label: `#${c.id} — ${c.full_name ?? ""}${c.dni ? ` (DNI ${c.dni})` : c.cuit ? ` (CUIT ${c.cuit})` : ""}`,
        }));
        setOptions(opts);
      } catch {
        setOptions([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  // Incluye la opción seleccionada aunque no esté en el resultado actual de búsqueda.
  const data =
    props.value && selectedRef.current && !options.some((o) => o.value === props.value)
      ? [selectedRef.current, ...options]
      : options;

  return (
    <Select
      label={props.label ?? "Cliente"}
      withAsterisk={props.required}
      placeholder={props.placeholder ?? "Buscar por nombre, DNI, tel, ID..."}
      searchable
      clearable={props.clearable}
      value={props.value || null}
      onChange={(v) => {
        const opt = data.find((o) => o.value === v) ?? null;
        selectedRef.current = opt;
        props.onChange(v ?? "");
      }}
      onSearchChange={setSearch}
      searchValue={search}
      data={data}
      nothingFoundMessage={loading ? "Buscando..." : "Sin resultados"}
      limit={20}
    />
  );
}
