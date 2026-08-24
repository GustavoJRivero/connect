import React, { useEffect, useState } from "react";
import { portalApi, setPortalToken } from "./api";
import { PortalLogin } from "./PortalLogin";
import { PortalShell } from "./PortalShell";

export function PortalApp() {
  const [authed, setAuthed] = useState(() => Boolean(localStorage.getItem("sc_portal_token")));
  const [name, setName] = useState("Cliente");
  const [unread, setUnread] = useState(0);

  function refreshMe() {
    portalApi
      .me()
      .then((me: any) => {
        setName(String(me.full_name || "Cliente"));
        setUnread(Number(me.unread_notifications || 0));
      })
      .catch(() => {
        setPortalToken(null);
        setAuthed(false);
      });
  }

  useEffect(() => {
    if (!authed) return;
    refreshMe();
  }, [authed]);

  useEffect(() => {
    const onUnauth = () => setAuthed(false);
    window.addEventListener("sc:portal-unauthorized", onUnauth);
    return () => window.removeEventListener("sc:portal-unauthorized", onUnauth);
  }, []);

  if (!authed) {
    return <PortalLogin onLoggedIn={() => setAuthed(true)} />;
  }

  return <PortalShell name={name} unread={unread} onLogout={() => setAuthed(false)} onRefresh={refreshMe} />;
}
