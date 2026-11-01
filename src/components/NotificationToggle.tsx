"use client";

import { useEffect, useState } from "react";
import {
  currentSubscription,
  isIOSBrowserTab,
  pushSupported,
  subscribe,
  unsubscribe,
} from "@/lib/push-client";

type State = "loading" | "hidden" | "install" | "denied" | "off" | "on" | "busy";

export function NotificationToggle() {
  const [state, setState] = useState<State>("loading");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
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

  if (state === "loading" || state === "hidden") return null;

  const enable = async () => {
    if (!publicKey) return;
    setState("busy");
    setNote(null);
    try {
      await subscribe(publicKey);
      setState("on");
      await fetch("/api/push/test", { method: "POST" });
    } catch (err) {
      setState(Notification.permission === "denied" ? "denied" : "off");
      setNote(err instanceof Error ? err.message : String(err));
    }
  };

  const disable = async () => {
    if (!confirm("Turn off notifications on this device?")) return;
    setState("busy");
    await unsubscribe().catch(() => {});
    setState("off");
  };

  const label = {
    install: "Add to Home Screen for notifications",
    denied: "Notifications blocked in Settings",
    off: "Enable notifications",
    on: "Notifications on",
    busy: "…",
  }[state];

  const sendTest = async () => {
    setNote(null);
    const res = await fetch("/api/push/test", { method: "POST" }).catch(() => null);
    const { sent } = res?.ok ? await res.json() : { sent: 0 };
    setNote(sent ? "Test sent — it should arrive in a few seconds" : "Couldn't send a test");
  };

  return (
    <div className="flex items-center">
    <button
      onClick={state === "off" ? enable : state === "on" ? disable : undefined}
      disabled={state === "install" || state === "denied" || state === "busy"}
      title={state === "on" ? "Tap to turn off on this device" : note ?? undefined}
      className="flex-1 min-w-0 text-left px-4 py-3 flex items-center gap-2 transition-all duration-150 text-sm
                 hover:bg-background-tertiary text-text-muted disabled:hover:bg-transparent disabled:opacity-70"
    >
      <span className={state === "on" ? "text-accent" : ""}>{state === "on" ? "●" : "○"}</span>
      <span>{label}</span>
    </button>
    {state === "on" && (
      <button onClick={sendTest} className="flex-shrink-0 px-4 py-3 text-xs text-text-faint hover:text-accent" title={note ?? undefined}>
        {note?.startsWith("Test sent") ? "sent" : "send test"}
      </button>
    )}
    </div>
  );
}
