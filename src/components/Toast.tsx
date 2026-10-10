"use client";

import { useCallback, useRef, useState } from "react";

type ToastState = {
  message: string;
  tone: "success" | "error";
  action?: { label: string; run: () => void };
  exiting: boolean;
};

// A single transient message, optionally with an action (e.g. Undo). Render
// `view` inside a positioned container; it sits at that container's bottom.
export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const show = useCallback(
    (message: string, opts: { tone?: ToastState["tone"]; action?: ToastState["action"]; ms?: number } = {}) => {
      timers.current.forEach(clearTimeout);
      setToast({ message, tone: opts.tone ?? "success", action: opts.action, exiting: false });
      timers.current = [
        setTimeout(() => setToast((t) => (t ? { ...t, exiting: true } : null)), opts.ms ?? 4000),
        setTimeout(() => setToast(null), (opts.ms ?? 4000) + 300),
      ];
    },
    []
  );

  const dismiss = useCallback(() => {
    timers.current.forEach(clearTimeout);
    setToast(null);
  }, []);

  // The wrapper centers; the inner box animates (its transform would
  // otherwise override a translate-based centering)
  const view = toast && (
    <div className="absolute inset-x-4 bottom-4 z-50 flex justify-center pointer-events-none">
    <div
      className={`pointer-events-auto flex items-center gap-3 px-4 py-3 bg-background-tertiary border text-sm shadow-glow
                  ${toast.tone === "error" ? "border-error/60 text-error" : "border-accent/40 text-accent"}
                  ${toast.exiting ? "toast-exit" : "toast-enter"}`}
      role="status"
    >
      <span>{toast.tone === "error" ? "!" : "✓"}</span>
      <span className="min-w-0">{toast.message}</span>
      {toast.action && (
        <button
          onClick={() => { toast.action!.run(); dismiss(); }}
          className="flex-shrink-0 underline underline-offset-2 hover:text-accent-hover"
        >
          {toast.action.label}
        </button>
      )}
    </div>
    </div>
  );

  return { show, view };
}
