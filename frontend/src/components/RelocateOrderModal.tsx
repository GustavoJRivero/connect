import React, { useEffect, useState } from "react";
import { Alert, Group, Modal, Stack, Text } from "@mantine/core";
import { api } from "../api";
import { Button, Field } from "../ui";
import { formatApiError } from "../format";
import { CoverageCheck, CoveragePreview } from "./CoverageCheck";

export type RelocatableOrder = {
  id: number;
  status: string;
  location_url?: string;
  service_address?: string;
  nap_name?: string;
  nap_ref?: string;
};

export function RelocateOrderModal(props: {
  order: RelocatableOrder | null;
  onClose: () => void;
  onSaved: (result: { status?: string }) => void;
}) {
  const o = props.order;
  const [locationUrl, setLocationUrl] = useState("");
  const [address, setAddress] = useState("");
  const [coverage, setCoverage] = useState<CoveragePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!o) return;
    setLocationUrl(o.location_url ?? "");
    setAddress(o.service_address ?? "");
    setCoverage(null);
    setError(null);
  }, [o]);

  async function save() {
    if (!o || !coverage) return;
    setSaving(true);
    setError(null);
    try {
      const res = (await api.relocateInstallation(o.id, {
        location_url: locationUrl.trim(),
        service_address: address.trim(),
      })) as { status?: string };
      props.onSaved(res ?? {});
    } catch (e: unknown) {
      setError(formatApiError(e));
    } finally {
      setSaving(false);
    }
  }

  const reserved = o?.status === "RESERVADO";

  return (
    <Modal opened={o != null} onClose={props.onClose} title={`Cambiar ubicación — orden #${o?.id ?? ""}`} size="lg">
      <Stack>
        {reserved ? (
          <Alert color="blue">
            La orden tiene un puerto reservado en <b>{o?.nap_name ?? o?.nap_ref ?? "el NAP"}</b>. Se libera solo si la
            nueva ubicación se guarda bien.
          </Alert>
        ) : null}
        {error ? <Alert color="red">{error}</Alert> : null}
        <Field label="Domicilio del servicio" value={address} onChange={setAddress} placeholder="Calle, número, barrio" />
        <CoverageCheck
          locationUrl={locationUrl}
          onLocationUrlChange={setLocationUrl}
          coverage={coverage}
          onCoverageChange={setCoverage}
          onError={setError}
        />
        {!coverage ? <Text size="sm" c="dimmed">Verificá la cobertura de la nueva ubicación para poder guardar.</Text> : null}
        <Group justify="flex-end">
          <Button variant="default" disabled={saving} onClick={props.onClose}>Cancelar</Button>
          <Button variant="primary" loading={saving} disabled={!coverage || !locationUrl.trim()} onClick={save}>
            {coverage && !coverage.available ? "Guardar sin cobertura" : "Guardar ubicación"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
