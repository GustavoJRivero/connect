import React, { useEffect, useRef } from "react";
import { Text, Button, Stack } from "@mantine/core";

declare global {
  interface Window {
    MercadoPago?: new (key: string, options?: { locale?: string }) => {
      bricks: () => {
        create: (name: string, container: string, opts: unknown) => Promise<unknown>;
      };
    };
  }
}

export function MpWallet(props: { publicKey: string; preferenceId: string; initPoint?: string | null }) {
  const loaded = useRef(false);

  useEffect(() => {
    if (!props.publicKey || !props.preferenceId) return;
    const containerId = "mp-wallet-brick";
    function mount() {
      if (!window.MercadoPago || loaded.current) return;
      loaded.current = true;
      const mp = new window.MercadoPago(props.publicKey, { locale: "es-AR" });
      void mp.bricks().create("wallet", containerId, {
        initialization: { preferenceId: props.preferenceId },
        customization: { texts: { valueProp: "security_safety" } },
      });
    }

    if (window.MercadoPago) {
      mount();
      return;
    }
    const existing = document.querySelector("script[data-mp-sdk]");
    if (existing) {
      existing.addEventListener("load", mount);
      return;
    }
    const s = document.createElement("script");
    s.src = "https://sdk.mercadopago.com/js/v2";
    s.async = true;
    s.setAttribute("data-mp-sdk", "1");
    s.onload = mount;
    document.body.appendChild(s);
  }, [props.publicKey, props.preferenceId]);

  return (
    <Stack gap="sm">
      <div id="mp-wallet-brick" />
      {props.initPoint ? (
        <Button component="a" href={props.initPoint} variant="light" color="violet">
          Pagar en Mercado Pago
        </Button>
      ) : (
        <Text size="sm" c="dimmed">Cargando checkout…</Text>
      )}
    </Stack>
  );
}
