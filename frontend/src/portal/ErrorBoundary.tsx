import React from "react";
import { Alert, Button, Stack } from "@mantine/core";

type Props = { children: React.ReactNode };
type State = { error: string | null };

export class PortalErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : String(error);
    return { error: message || "Error inesperado" };
  }

  render() {
    if (this.state.error) {
      return (
        <Alert color="red" title="No se pudo mostrar esta pantalla">
          <Stack gap="sm">
            <span>{this.state.error}</span>
            <Button
              variant="default"
              size="xs"
              onClick={() => {
                this.setState({ error: null });
                window.location.reload();
              }}
            >
              Recargar
            </Button>
          </Stack>
        </Alert>
      );
    }
    return this.props.children;
  }
}
