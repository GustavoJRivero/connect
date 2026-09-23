import React, { createContext, useContext } from "react";
import { Alert } from "@mantine/core";
import type { Me } from "./api";

export type PermAction = "view" | "edit" | "delete";

const MeContext = createContext<Me | null>(null);

export const MeProvider = MeContext.Provider;

export function useMe(): Me | null {
  return useContext(MeContext);
}

export function canDo(me: Me | null, module: string, action: PermAction = "view"): boolean {
  if (!me) return false;
  if (me.is_admin) return true;
  return (me.permissions?.[module] ?? []).includes(action);
}

/** `const can = useCan(); can("clients", "edit")` */
export function useCan() {
  const me = useMe();
  return (module: string, action: PermAction = "view") => canDo(me, module, action);
}

export function RequirePermission(props: { module: string; children: React.ReactNode }) {
  const me = useMe();
  if (!me) return null;
  if (!canDo(me, props.module, "view")) {
    return (
      <Alert color="orange" variant="light" title="Sin acceso">
        Tu rol no tiene permiso para ver esta sección. Pedile a un administrador que te lo habilite.
      </Alert>
    );
  }
  return <>{props.children}</>;
}
