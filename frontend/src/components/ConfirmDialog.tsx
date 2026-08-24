import React, { useEffect, useState } from "react";
import { Modal, Group, Text, Button } from "@mantine/core";

/**
 * Confirmación consistente para acciones destructivas o irreversibles.
 *
 * Uso:
 *   const [confirm, setConfirm] = useState<ConfirmState>(null);
 *   ...
 *   <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
 *   ...
 *   setConfirm({
 *     title: "Eliminar cliente",
 *     message: "Se eliminará el cliente y sus conexiones. Esta acción no se puede deshacer.",
 *     confirmLabel: "Eliminar",
 *     danger: true,
 *     onConfirm: async () => { await api.deleteClient(id); await reload(); },
 *   });
 */
export type ConfirmState = {
  title?: string;
  message: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
} | null;

export function ConfirmDialog(props: { state: ConfirmState; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  // Conserva el último contenido para que no "salte" durante la animación de cierre.
  const [view, setView] = useState<ConfirmState>(props.state);
  useEffect(() => {
    if (props.state) setView(props.state);
  }, [props.state]);
  const s = props.state ?? view;

  async function run() {
    if (!props.state) return;
    setBusy(true);
    try {
      await props.state.onConfirm();
      props.onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      opened={props.state != null}
      onClose={() => { if (!busy) props.onClose(); }}
      title={s?.title ?? "Confirmar"}
      size="md"
      centered
      zIndex={400}
    >
      {typeof s?.message === "string" ? (
        <Text size="sm">{s.message}</Text>
      ) : (
        <div style={{ fontSize: "var(--mantine-font-size-sm)" }}>{s?.message}</div>
      )}
      <Group justify="flex-end" mt="lg">
        <Button variant="light" color="gray" size="sm" disabled={busy} onClick={props.onClose}>
          Cancelar
        </Button>
        <Button
          variant="filled"
          color={s?.danger ? "red" : "violet"}
          size="sm"
          loading={busy}
          onClick={run}
        >
          {s?.confirmLabel ?? "Confirmar"}
        </Button>
      </Group>
    </Modal>
  );
}
