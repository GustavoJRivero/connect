import React from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider, createTheme, MantineColorsTuple } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import App from "./App";
import "./styles.css";
import { API_BASE_URL } from "./api";
import { loadAppTimezone } from "./datetime";

// Cargamos la TZ configurada en el backend antes de pintar la UI; si falla queda el cache.
void loadAppTimezone(API_BASE_URL);

const violet: MantineColorsTuple = [
  "#f6f1fb",
  "#eadef5",
  "#d4c0ea",
  "#b99adc",
  "#9f78cd",
  "#8b61c1",
  "#7a4fb0",
  "#68429a",
  "#563782",
  "#442b68",
];

const gray: MantineColorsTuple = [
  "#f4f5f7",
  "#e8eaee",
  "#dde0e5",
  "#c8ccd3",
  "#b0b6bf",
  "#8e959f",
  "#6e7580",
  "#3f454c",
  "#2c3138",
  "#1a1d21",
];

const theme = createTheme({
  primaryColor: "violet",
  primaryShade: 6,
  colors: { violet, gray },
});

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root");

createRoot(container).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Notifications position="top-right" limit={4} />
      <App />
    </MantineProvider>
  </React.StrictMode>
);

