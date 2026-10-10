"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { TodoList } from "@/lib/types";
import { Chat, type ChatMessage } from "./Chat";
import { ResultCard } from "./ResultCard";

type ApplyResult = { results: { action: string; result: string }[]; errors: string[] };

type Props = { lists: TodoList[]; onApplied: () => void; onDone: () => void };

// Talk through list changes with Sonnet, then Implement: the server turns the
// agreed changes into actions and applies them.
export function RefactorLists({ lists, onApplied, onDone }: Props) {
  const [session, setSession] = useState(0);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);

  const implement = async (messages: ChatMessage[]) => {
    setApplying(true);
    setError(null);
    try {
      setResult(await api<ApplyResult>("/api/refactor/apply", { body: { messages } }));
      onApplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplying(false);
    }
  };

  const startOver = () => {
    setResult(null);
    setError(null);
    setSession((s) => s + 1);
  };

  if (result) {
    return (
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          <ResultCard
            title={result.results.length ? "Changes applied" : "Nothing changed"}
            lines={result.results.map((r) => r.result)}
            errors={result.errors}
          />
          <div className="flex flex-wrap gap-2">
            <button onClick={onDone} className="incandescent-button bg-accent/20 border-accent text-accent">
              Go to Inbox
            </button>
            <button onClick={startOver} className="incandescent-button">More changes</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Chat
      key={session}
      endpoint="/api/refactor/chat"
      placeholder="Describe what you want to change…"
      intro={
        <div className="incandescent-card p-4 space-y-3 text-sm">
          <p className="text-text-muted">
            Tell Sonnet how you&apos;d like your lists organized — merge, split, rename, retag, move items or
            delete lists. When you&apos;re happy with the plan, press Implement.
          </p>
          <p className="text-xs text-text-faint">{lists.length} lists: {lists.map((l) => l.name).join(", ")}</p>
        </div>
      }
      actions={(messages, busy) => (
        <>
          <button
            onClick={() => implement(messages)}
            disabled={busy || applying || messages.length < 2}
            className="incandescent-button bg-accent/20 border-accent text-accent disabled:opacity-30"
          >
            {applying ? "Implementing…" : "Implement"}
          </button>
          {messages.length > 0 && (
            <button onClick={startOver} disabled={applying} className="incandescent-button text-text-muted">
              Clear
            </button>
          )}
          {error && <span className="text-sm text-error self-center">{error}</span>}
        </>
      )}
    />
  );
}
