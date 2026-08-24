import React, { useState } from "react";
import { Alert, Group, Stack } from "@mantine/core";
import { api } from "../api";
import { Button, Field } from "../ui";
import { formatApiError } from "../format";
import { CoverageMap } from "./CoverageMap";

export type CoveragePreview = {
  available: boolean;
  chosen_nap?: { ref?: string; name?: string; distance?: number | null; lat?: number; lng?: number } | null;
  fiber_meters?: number | null;
  location?: { lat: number; lng: number } | null;
  radius_meters?: number | null;
};

/**
 * Campo de ubicación + botón "Verificar cobertura" + resultado con mapa.
 * Reutilizado en el alta de cliente (wizard) y en "Nueva conexión".
 */
export function CoverageCheck(props: {
  locationUrl: string;
  onLocationUrlChange: (v: string) => void;
  coverage: CoveragePreview | null;
  onCoverageChange: (c: CoveragePreview | null) => void;
  onError: (msg: string | null) => void;
}) {
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    props.onError(null);
    props.onCoverageChange(null);
    try {
      const res = (await api.previewCoverage({ location_url: props.locationUrl })) as CoveragePreview;
      props.onCoverageChange(res);
    } catch (e: unknown) {
      const err = e as { status?: number };
      if (err?.status === 503) props.onError("La API de mapas no está configurada (falta MAPS_API_KEY en el backend).");
      else props.onError(`Error consultando cobertura: ${formatApiError(e)}`);
    } finally {
      setChecking(false);
    }
  }

  const cov = props.coverage;
  const clientLoc = cov?.location && Number.isFinite(cov.location.lat) && Number.isFinite(cov.location.lng) ? cov.location : null;

  return (
    <Stack gap="xs">
      <Group align="flex-end" gap="xs">
        <div style={{ flex: 1 }}>
          <Field
            label="Ubicación en el mapa (link de Google Maps o lat,lng)"
            value={props.locationUrl}
            onChange={(v) => {
              props.onLocationUrlChange(v);
              props.onCoverageChange(null);
            }}
            placeholder="https://maps.app.goo.gl/... o -26.87,-60.23"
          />
        </div>
        <Button variant="info" disabled={!props.locationUrl} loading={checking} onClick={check}>
          Verificar cobertura
        </Button>
      </Group>

      {cov ? (
        cov.available ? (
          <Alert color="green">
            Hay cobertura. NAP más cercano: <b>{cov.chosen_nap?.name ?? cov.chosen_nap?.ref ?? "?"}</b>
            {cov.chosen_nap?.distance != null ? <> a <b>{Math.round(Number(cov.chosen_nap.distance))} m</b></> : null}
            {cov.fiber_meters != null ? <> — fibra estimada: <b>{cov.fiber_meters} m</b></> : null}.
            Al guardar se reservará un puerto automáticamente.
          </Alert>
        ) : (
          <Alert color="orange">
            Sin cobertura en esa ubicación. Se puede crear igual: la solicitud quedará en el apartado <b>Sin cobertura</b> de
            Instalaciones.
          </Alert>
        )
      ) : null}

      {cov && clientLoc ? (
        <CoverageMap
          client={clientLoc}
          nap={
            cov.available && cov.chosen_nap && cov.chosen_nap.lat != null && cov.chosen_nap.lng != null
              ? { lat: cov.chosen_nap.lat, lng: cov.chosen_nap.lng, name: cov.chosen_nap.name, distance: cov.chosen_nap.distance }
              : null
          }
        />
      ) : null}
    </Stack>
  );
}
