/**
 * Toasts de feedback global (éxito / error).
 * Para errores persistentes de página se sigue usando el Alert inline;
 * estos toasts son para confirmaciones efímeras de acciones puntuales.
 */
import { notifications } from "@mantine/notifications";

export function notifySuccess(message: string, title = "Listo") {
  notifications.show({
    title,
    message,
    color: "green",
    autoClose: 4000,
    withBorder: true,
  });
}

export function notifyError(message: string, title = "Error") {
  notifications.show({
    title,
    message,
    color: "red",
    autoClose: 7000,
    withBorder: true,
  });
}
