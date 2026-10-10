"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { readTextStream } from "@/lib/stream-client";
import { Markdown } from "./Markdown";

export type ChatMessage = { role: "user" | "assistant"; content: string };

type Props = {
  // Streaming endpoint; receives { messages, ...body }
  endpoint: string;
  body?: Record<string, unknown>;
  // Sent automatically when the chat mounts (e.g. "review these notes")
  opening?: string;
  placeholder?: string;
  intro?: ReactNode;
  // Buttons under the input; gets the conversation so far
  actions?: (messages: ChatMessage[], busy: boolean) => ReactNode;
};

// A streaming conversation with one of the chat routes. Remount (change `key`)
// to start over.
export function Chat({ endpoint, body, opening, placeholder, intro, actions }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const opened = useRef(false);

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    const history: ChatMessage[] = [...messages, { role: "user", content: text.trim() }];
    setMessages(history);
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, messages: history }),
      });
      const reply = await readTextStream(res, (partial) =>
        setMessages([...history, { role: "assistant", content: partial }])
      );
      setMessages([...history, { role: "assistant", content: reply }]);
    } catch (err) {
      // Drop the unanswered turn so the conversation stays valid; keep the text
      setMessages(messages);
      setInput(text);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (opening && !opened.current) {
      opened.current = true;
      send(opening);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const waiting = busy && messages[messages.length - 1]?.role === "user";

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 && !busy && intro}
          {messages.map((m, i) =>
            m.role === "assistant" ? (
              <div key={i} className="incandescent-card p-4 text-sm">
                <Markdown>{m.content}</Markdown>
              </div>
            ) : (
              <div key={i} className="bg-accent/10 border border-accent/30 p-4 text-sm whitespace-pre-wrap ml-8">
                {m.content}
              </div>
            )
          )}
          {waiting && <div className="incandescent-card p-4 text-sm text-text-muted animate-pulse">Thinking…</div>}
          {error && <div className="border border-error/50 p-3 text-sm text-error">{error}</div>}
          <div ref={endRef} />
        </div>
      </div>

      <div className="flex-shrink-0 border-t border-border bg-background-primary px-4 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="max-w-3xl mx-auto space-y-3">
          <div className="flex gap-2">
            <textarea
              suppressHydrationWarning
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  setInput("");
                  send(input);
                }
              }}
              placeholder={placeholder ?? "Reply…"}
              disabled={busy}
              rows={2}
              className="flex-1 incandescent-input px-3 py-2 text-base sm:text-sm resize-none"
            />
            <button
              onClick={() => { setInput(""); send(input); }}
              disabled={!input.trim() || busy}
              className="incandescent-button self-end disabled:opacity-30"
            >
              Send
            </button>
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions(messages, busy)}</div>}
        </div>
      </div>
    </div>
  );
}
