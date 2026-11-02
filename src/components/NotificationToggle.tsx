"use client";

import type { usePush } from "@/lib/use-push";

const LABELS = {
  install: "Add to Home Screen for notifications",
  denied: "Notifications blocked in Settings",
  off: "Enable notifications",
  on: "Notifications on",
  busy: "…",
};

// Sidebar control for this device's reminder notifications.
export function NotificationToggle({ push }: { push: ReturnType<typeof usePush> }) {
  const { state, note } = push;
  if (state === "loading" || state === "hidden") return null;

  const onClick =
    state === "off"
      ? push.enable
      : state === "on"
        ? () => confirm("Turn off notifications on this device?") && push.disable()
        : undefined;

  return (
    <div className="flex items-center">
      <button
        onClick={onClick}
        disabled={state === "install" || state === "denied" || state === "busy"}
        title={state === "on" ? "Tap to turn off on this device" : note ?? undefined}
        className="flex-1 min-w-0 text-left px-4 py-3 flex items-center gap-2 transition-all duration-150 text-sm
                   hover:bg-background-tertiary text-text-muted disabled:hover:bg-transparent disabled:opacity-70"
      >
        <span className={state === "on" ? "text-accent" : ""}>{state === "on" ? "●" : "○"}</span>
        <span>{LABELS[state]}</span>
      </button>
      {state === "on" && (
        <button onClick={push.sendTest} className="flex-shrink-0 px-4 py-3 text-xs text-text-faint hover:text-accent" title={note ?? undefined}>
          {note?.startsWith("Test sent") ? "sent" : "send test"}
        </button>
      )}
    </div>
  );
}
