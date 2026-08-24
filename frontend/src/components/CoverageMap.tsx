import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Mapa de cobertura (Leaflet + OpenStreetMap): muestra el punto del cliente,
 * el NAP elegido y la línea entre ambos. Sin íconos de imagen (circleMarker)
 * para evitar problemas de assets con el bundler.
 */
export function CoverageMap(props: {
  client: { lat: number; lng: number };
  clientLabel?: string;
  nap?: { lat: number; lng: number; name?: string | null; distance?: number | null } | null;
  height?: number;
}) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!divRef.current) return;
    if (!mapRef.current) {
      mapRef.current = L.map(divRef.current, { attributionControl: false, zoomControl: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(mapRef.current);
      L.control.attribution({ prefix: false }).addAttribution("© OpenStreetMap").addTo(mapRef.current);
      layerRef.current = L.layerGroup().addTo(mapRef.current);
    }
    const map = mapRef.current;
    const layer = layerRef.current!;
    layer.clearLayers();

    const clientPt = L.latLng(props.client.lat, props.client.lng);
    L.circleMarker(clientPt, { radius: 8, color: "#68429a", fillColor: "#7a4fb0", fillOpacity: 0.9, weight: 2 })
      .bindTooltip(props.clientLabel?.trim() || "Cliente", { permanent: true, direction: "bottom", offset: [0, 8] })
      .addTo(layer);

    if (props.nap && Number.isFinite(props.nap.lat) && Number.isFinite(props.nap.lng)) {
      const napPt = L.latLng(props.nap.lat, props.nap.lng);
      L.circleMarker(napPt, { radius: 8, color: "#2f9e44", fillColor: "#51cf66", fillOpacity: 0.9, weight: 2 })
        .bindTooltip(
          `${props.nap.name ?? "NAP"}${props.nap.distance != null ? ` · ${Math.round(Number(props.nap.distance))} m` : ""}`,
          { permanent: true, direction: "top", offset: [0, -8] },
        )
        .addTo(layer);
      L.polyline([clientPt, napPt], { color: "#868e96", dashArray: "6 6", weight: 2 }).addTo(layer);
      map.fitBounds(L.latLngBounds([clientPt, napPt]).pad(0.35));
    } else {
      map.setView(clientPt, 17);
    }
    // El contenedor puede haberse montado dentro de un modal/step recién abierto.
    setTimeout(() => map.invalidateSize(), 50);
  }, [props.client.lat, props.client.lng, props.clientLabel, props.nap?.lat, props.nap?.lng, props.nap?.name, props.nap?.distance]);

  useEffect(() => () => {
    mapRef.current?.remove();
    mapRef.current = null;
  }, []);

  return (
    <div
      ref={divRef}
      style={{
        height: props.height ?? 280,
        width: "100%",
        borderRadius: "var(--mantine-radius-md)",
        overflow: "hidden",
        border: "1px solid var(--mantine-color-default-border)",
        zIndex: 0,
      }}
    />
  );
}
