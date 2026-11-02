"use client";

import { useEffect, useState } from "react";
import { currentSubscription, isIOSBrowserTab, pushSupported, subscribe, unsubscribe } from "./push-client";

// Push notification state for this device:
// hidden (server has no push keys / browser can't), install (iOS browser tab:
// push needs the home-screen app), denied, off (could subscribe but hasn't —
// e.g. a freshly reinstalled home-screen app), on.
export type PushState = "loading" | "hidden" | "install" | "denied" | "off" | "on" | "busy";

// Set when the user turns notifications off or dismisses the reminder banner.
// Stored per install, so a reinstalled app (the case the banner is for)
// starts without it.
const DECLINED_KEY = "pushDeclined";
const storage = {
  get: () => { try { return localStorage.getItem(DECLINED_KEY) === "1"; } catch { return false; } },
  set: (v: boolean) => { try { if (v) localStorage.setItem(DECLINED_KEY, "1"); else localStorage.removeItem(DECLINED_KEY); } catch {} },
};

export function usePush() {
  const [state, setState] = useState<PushState>("loading");
  const [declined, setDeclined] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    setDeclined(storage.get());
    (async () => {
      const res = await fetch("/api/push").catch(() => null);
      const info = res?.ok ? await res.json() : null;
      if (!info?.configured) return setState("hidden");
      if (isIOSBrowserTab()) return setState("install");
      if (!pushSupported()) return setState("hidden");
      setPublicKey(info.publicKey);
      if (Notification.permission === "denied") return setState("denied");
      const sub = await currentSubscription();
      if (sub) {
        // Re-register in case the server lost it (e.g. a restored database).
        fetch("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub.toJSON()),
        });
      }
      setState(sub ? "on" : "off");
    })();
  }, []);

  const enable = async () => {
    if (!publicKey) return;
    setState("busy");
    setNote(null);
    try {
      await subscribe(publicKey);
      setState("on");
      storage.set(false);
      setDeclined(false);
      await fetch("/api/push/test", { method: "POST" });
    } catch (err) {
      setState(Notification.permission === "denied" ? "denied" : "off");
      setNote(err instanceof Error ? err.message : String(err));
    }
  };

  const disable = async () => {
    setState("busy");
    await unsubscribe().catch(() => {});
    setState("off");
    decline();
  };

  const decline = () => {
    storage.set(true);
    setDeclined(true);
  };

  const sendTest = async () => {
    setNote(null);
    const res = await fetch("/api/push/test", { method: "POST" }).catch(() => null);
    const { sent } = res?.ok ? await res.json() : { sent: 0 };
    setNote(sent ? "Test sent — it should arrive in a few seconds" : "Couldn't send a test");
  };

  return { state, note, enable, disable, sendTest, decline, nudge: state === "off" && !declined };
}
