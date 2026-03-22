# Frontend — Convenciones y patrones

## Stack

- **React 18** con functional components y hooks
- **TypeScript** estricto
- **react-router-dom** para navegación (BrowserRouter en `App.tsx`)
- **AdminLTE** + **Mantine** para componentes UI
- **fetch()** nativo para HTTP (centralizado en `src/api.ts`)

## Estructura

```
frontend/src/
  App.tsx           # raíz: maneja auth state (authed/no authed)
  AppShell.tsx      # layout principal con sidebar y routing
  Login.tsx         # pantalla de login / bootstrap primer admin
  api.ts            # TODAS las llamadas HTTP van por acá
  ui.tsx            # componentes UI reutilizables
  pages/            # una página por módulo del sistema
  components/       # modales y componentes complejos reutilizables
```

## Cómo agregar una nueva página

1. Crear `src/pages/MiPaginaPage.tsx`
2. Agregar la ruta en `AppShell.tsx`
3. Agregar los métodos de API necesarios en `api.ts`

Estructura base de una página:

```tsx
import React, { useEffect, useState } from "react";
import { api } from "../api";

export default function MiPaginaPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.miMetodo()
      .then(setItems)
      .catch((e) => setError(e?.body?.error ?? "Error"))
      .finally(() => setLoading(false));
  }, []);

  return <div>...</div>;
}
```

## Cómo agregar llamadas a la API

Agregar en `src/api.ts` dentro del objeto `api`:

```typescript
// Siempre usar el helper request() interno — nunca fetch() directo
miNuevoEndpoint(payload: any) {
  return request("/api/mi_modulo/accion", {
    method: "POST",
    body: JSON.stringify(payload),
  });
},
```

El helper `request()` ya maneja:
- Adjuntar el JWT Bearer token automáticamente
- Emitir evento `sc:unauthorized` si el token expira (el App.tsx lo escucha y desloguea)
- Indicador de carga global via evento `sc:loading`
- Parseo seguro del JSON de respuesta

## Autenticación

- El token JWT se guarda en `localStorage` como `sc_token`
- `setToken(token)` / `getToken()` en `api.ts` son las únicas funciones para manipularlo
- `App.tsx` maneja el estado `authed` globalmente — no replicar esta lógica en páginas
- Si un request devuelve 401, `api.ts` limpia el token y dispara `sc:unauthorized` automáticamente

## Patrones de modales

Los modales están en `src/components/`. Patrón estándar:

```tsx
interface Props {
  clientId: number;
  onClose: () => void;
  onSaved: () => void;  // para que la página padre recargue datos
}

export default function MiModal({ clientId, onClose, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await api.miAccion({ clientId, ... });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.body?.message ?? e?.body?.error ?? "Error");
    } finally {
      setSaving(false);
    }
  };

  return (...);
}
```

## Manejo de errores de API

Los errores del tipo `ApiError` tienen la forma `{ status: number, body: any }`.
Siempre acceder como `e?.body?.error` o `e?.body?.message` para mostrar al usuario.

```tsx
.catch((e: any) => {
  setError(e?.body?.message ?? e?.body?.error ?? "Error desconocido");
})
```

## Agregar Mercado Pago (próxima integración)

Cuando se implemente la pasarela MP:
- Agregar `api.createMpPreference(invoiceIds)` y `api.getMpPaymentStatus(preferenceId)` en `api.ts`
- El botón "Pagar con MP" va en `InvoiceModal.tsx` — redirigir a `init_point` devuelto por el backend
- Crear páginas de retorno: `src/pages/PaymentSuccessPage.tsx`, `PaymentPendingPage.tsx`, `PaymentFailurePage.tsx`
- Registrar las rutas en `AppShell.tsx`: `/payment/success`, `/payment/pending`, `/payment/failure`
