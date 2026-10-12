"use client";

import { useState } from "react";
import { api } from "@/lib/api";

// Type a time in words ("Oct 19", "next Thursday at 8pm") and press Enter;
// the server's model turns it into an exact time.
export function TimeInput({
  onResolved,
  placeholder = "Or type a time…",
  className = "",
}: {
  onResolved: (when: Date) => void;
  placeholder?: string;
  className?: string;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolve = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { when } = await api<{ when: string }>("/api/parse-time", { body: { text } });
      setText("");
      onResolved(new Date(when));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      <div className="flex gap-1">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              resolve();
            }
          }}
          placeholder={placeholder}
          disabled={busy}
          enterKeyHint="go"
          className="flex-1 min-w-0 incandescent-input px-2 py-1.5 text-base sm:text-sm"
        />
        <button onClick={resolve} disabled={!text.trim() || busy} className="incandescent-button px-2 py-1 text-sm disabled:opacity-30">
          {busy ? "…" : "Set"}
        </button>
      </div>
      {error && <p className="text-xs text-error mt-1">{error}</p>}
    </div>
  );
}
