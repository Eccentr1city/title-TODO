"use client";

import { useState, useRef, useEffect } from "react";
import { TodoList } from "@/lib/types";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface RefactorListsProps {
  lists: TodoList[];
  onComplete: () => void;
  onCancel: () => void;
}

export function RefactorLists({ lists, onComplete, onCancel }: RefactorListsProps) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applyResults, setApplyResults] = useState<{
    results: { action: string; result: string }[];
    errors: string[];
  } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Send a chat message and get Sonnet's response. Returns the updated messages array.
  const sendToSonnet = async (messages: ChatMessage[]): Promise<ChatMessage[]> => {
    const res = await fetch("/api/refactor/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });
    const data = await res.json();
    return [...messages, { role: "assistant" as const, content: data.response }];
  };

  const sendMessage = async (text?: string) => {
    const userMessage = text || chatInput.trim();
    if (!userMessage || isSending) return;

    setChatInput("");
    const updatedMessages = [...chatMessages, { role: "user" as const, content: userMessage }];
    setChatMessages(updatedMessages);
    setIsSending(true);

    try {
      const result = await sendToSonnet(updatedMessages);
      setChatMessages(result);
    } catch (err) {
      console.error("Refactor chat error:", err);
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error: failed to get response." },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const implementChanges = async () => {
    if (isSending) return;
    setIsSending(true);

    try {
      // Build the messages: include any drafted input, then ask for JSON
      let messages = [...chatMessages];

      const draftText = chatInput.trim();
      if (draftText) {
        messages = [...messages, { role: "user" as const, content: draftText }];
        setChatInput("");
      }

      // Ask Sonnet to output the structured JSON
      const implementMsg = draftText
        ? "Now please output the final actions as a JSON block."
        : "Looks good. Please output the final actions as a JSON block.";
      messages = [...messages, { role: "user" as const, content: implementMsg }];
      setChatMessages(messages);

      // Get Sonnet's response with JSON
      const result = await sendToSonnet(messages);
      setChatMessages(result);

      // Extract and apply the JSON
      const lastMsg = result[result.length - 1];
      if (lastMsg.role !== "assistant") return;

      const jsonMatch = lastMsg.content.match(/```json\s*([\s\S]*?)```/);
      if (!jsonMatch) {
        // Sonnet didn't output JSON — ask again
        const retry = [...result, { role: "user" as const, content: "I need the actions as a ```json block. Please try again." }];
        setChatMessages(retry);
        const retryResult = await sendToSonnet(retry);
        setChatMessages(retryResult);

        const retryMsg = retryResult[retryResult.length - 1];
        const retryMatch = retryMsg.content.match(/```json\s*([\s\S]*?)```/);
        if (!retryMatch) return;

        await applyActions(retryMatch[1]);
        return;
      }

      await applyActions(jsonMatch[1]);
    } catch (err) {
      console.error("Implement error:", err);
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${String(err)}` },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const applyActions = async (jsonStr: string) => {
    let actions;
    try {
      actions = JSON.parse(jsonStr.trim());
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error: could not parse the JSON. Try describing the changes again." },
      ]);
      return;
    }

    setIsApplying(true);
    setIsSending(false);
    try {
      const res = await fetch("/api/refactor/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actions }),
      });
      const data = await res.json();
      setApplyResults(data);
    } catch (err) {
      console.error("Apply error:", err);
      setApplyResults({
        results: [],
        errors: [String(err)],
      });
    } finally {
      setIsApplying(false);
    }
  };

  // Done state
  if (applyResults) {
    return (
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="incandescent-card p-4">
            <h3 className="heat-3 font-medium mb-3">Refactor Complete</h3>
            {applyResults.results.length > 0 && (
              <div className="space-y-2 mb-4">
                {applyResults.results.map((r, i) => (
                  <div key={i} className="text-sm">
                    <span className="text-accent font-medium">{r.action}:</span>{" "}
                    <span className="text-text-normal">{r.result}</span>
                  </div>
                ))}
              </div>
            )}
            {applyResults.errors.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs text-error uppercase">Errors:</div>
                {applyResults.errors.map((e, i) => (
                  <div key={i} className="text-sm text-error">{e}</div>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <button
              onClick={onComplete}
              className="incandescent-button bg-accent/20 border-accent text-accent"
            >
              Go to Inbox
            </button>
            <button
              onClick={() => {
                setApplyResults(null);
                setChatMessages([]);
              }}
              className="incandescent-button"
            >
              Start over
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Applying state
  if (isApplying) {
    return (
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="text-center py-12">
          <div className="text-4xl mb-4 animate-pulse">~</div>
          <p className="text-text-muted">Applying changes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Empty state / intro */}
        {chatMessages.length === 0 && (
          <div className="incandescent-card p-4 space-y-3">
            <h3 className="heat-3 font-medium">Refactor Lists</h3>
            <p className="text-sm text-text-muted">
              Tell Sonnet what you want to change about your list organization. For example:
            </p>
            <ul className="text-sm text-text-faint space-y-1 ml-4 list-disc">
              <li>Split &quot;Reading &amp; Watchlist&quot; into separate lists</li>
              <li>Merge similar lists together</li>
              <li>Rename or retag lists for better organization</li>
              <li>Delete empty or obsolete lists</li>
              <li>Move items between lists</li>
            </ul>
            <div className="text-xs text-text-faint pt-2 border-t border-border">
              Current lists: {lists.map((l) => l.name).join(", ")}
            </div>
          </div>
        )}

        {/* Chat messages */}
        {chatMessages.map((msg, i) => (
          <div
            key={i}
            className={`${
              msg.role === "assistant"
                ? "incandescent-card p-4"
                : "bg-accent/10 border border-accent/30 p-4"
            }`}
          >
            <div className="text-xs text-text-faint mb-2 uppercase tracking-wider">
              {msg.role === "assistant" ? "Sonnet" : "You"}
            </div>
            <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
          </div>
        ))}

        {isSending && (
          <div className="incandescent-card p-4">
            <div className="text-xs text-text-faint mb-2 uppercase tracking-wider">Sonnet</div>
            <div className="animate-pulse text-text-muted">Thinking...</div>
          </div>
        )}

        <div ref={chatEndRef} />

        {/* Chat input */}
        <div className="sticky bottom-0 bg-background-primary pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3">
          <div className="flex gap-2">
            <textarea
              suppressHydrationWarning
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Describe what you want to change..."
              disabled={isSending}
              rows={2}
              className="flex-1 incandescent-input px-3 py-2 text-sm resize-none"
            />
            <button
              onClick={() => sendMessage()}
              disabled={!chatInput.trim() || isSending}
              className="incandescent-button self-end disabled:opacity-30"
            >
              Send
            </button>
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            {chatMessages.length > 0 && (
              <button
                onClick={implementChanges}
                disabled={isSending}
                className="incandescent-button bg-accent/20 border-accent text-accent disabled:opacity-30"
              >
                Implement changes
              </button>
            )}
            {chatMessages.length > 0 && (
              <button
                onClick={() => {
                  setChatMessages([]);
                  setChatInput("");
                  setApplyResults(null);
                }}
                className="incandescent-button text-sm text-text-muted"
              >
                Clear chat
              </button>
            )}
            <button onClick={onCancel} className="incandescent-button text-sm">
              Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
