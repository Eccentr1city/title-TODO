"use client";

import { useState } from "react";
import { readTextStream } from "@/lib/stream-client";
import { Markdown } from "./Markdown";

// One-shot questions about the current list ("what should I do first?").
export function AskAboutList({ listId, listName }: { listId: string; listName: string }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ask = async () => {
    if (!question.trim() || busy) return;
    setBusy(true);
    setAnswer("");
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listId, question }),
      });
      setAnswer(await readTextStream(res, setAnswer));
    } catch (err) {
      setAnswer(`Something went wrong: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {answer !== null && (
        <div className="relative max-h-[40vh] overflow-y-auto p-3 bg-background-tertiary border border-border text-sm animate-fade-in">
          {answer ? <Markdown>{answer}</Markdown> : <span className="text-text-muted animate-pulse">Thinking…</span>}
          {!busy && (
            <button onClick={() => setAnswer(null)} className="absolute top-1 right-2 text-text-faint hover:text-accent" aria-label="Dismiss">
              &times;
            </button>
          )}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder={`Ask about ${listName}…`}
          className="flex-1 min-w-0 incandescent-input px-3 py-2 text-base sm:text-sm"
          disabled={busy}
        />
        <button onClick={ask} disabled={!question.trim() || busy} className="incandescent-button text-sm disabled:opacity-30">
          {busy ? "…" : "Ask"}
        </button>
      </div>
    </div>
  );
}
