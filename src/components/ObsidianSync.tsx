"use client";

import { useState, useEffect, useRef } from "react";
import { readTextStream } from "@/lib/stream-client";

interface TriageNote {
  filename: string;
  has_personal: boolean;
  has_work: boolean;
  personal_summary: string;
  work_summary: string;
}

interface SyncStatus {
  lastRunAt: string;
  triagePrompt: string;
  totalProcessed: number;
  totalNotes: number;
  newOrModifiedCount: number;
  personalNotes: TriageNote[];
  workNotes: TriageNote[];
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ObsidianSyncProps {
  onComplete: () => void;
  onCancel: () => void;
}

type SyncStage =
  | "overview"
  | "edit-triage-prompt"
  | "triage-running"
  | "triage-results"
  | "edit-plan-prompt"
  | "planning"
  | "applying"
  | "done"
  | "manual-files"
  | "manual-planning"
  | "manual-applying"
  | "manual-done";

export function ObsidianSync({ onComplete, onCancel }: ObsidianSyncProps) {
  const [stage, setStage] = useState<SyncStage>("overview");
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Triage state
  const [triagePrompt, setTriagePrompt] = useState("");
  const [forceReprocess, setForceReprocess] = useState(false);
  const [triageResults, setTriageResults] = useState<{
    processed: number;
    personalCount: number;
    workCount: number;
  } | null>(null);

  // Plan state
  const [planPrompt, setPlanPrompt] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Apply state
  const [applyResults, setApplyResults] = useState<{
    createdLists: string[];
    createdTodos: { list: string; title: string }[];
    errors: string[];
  } | null>(null);

  // Manual file state
  const [manualFilePaths, setManualFilePaths] = useState("");
  const [manualMessages, setManualMessages] = useState<ChatMessage[]>([]);
  const [manualInput, setManualInput] = useState("");
  const [manualSending, setManualSending] = useState(false);
  const manualEndRef = useRef<HTMLDivElement>(null);

  // UI state
  const [showWork, setShowWork] = useState(false);

  useEffect(() => {
    fetchStatus();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    manualEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [manualMessages]);

  const fetchStatus = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/obsidian");
      const data = await res.json();
      setStatus(data);
      setTriagePrompt(data.triagePrompt);
    } catch (err) {
      console.error("Failed to fetch obsidian status:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const runTriage = async () => {
    setStage("triage-running");
    try {
      const res = await fetch("/api/obsidian", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: triagePrompt, force: forceReprocess }),
      });
      const data = await res.json();
      setTriageResults(data);
      setStage("triage-results");
      await fetchStatus();
    } catch (err) {
      console.error("Triage failed:", err);
      setStage("overview");
    }
  };

  const startPlanning = async () => {
    // Fetch the default plan prompt
    const res = await fetch("/api/obsidian/plan");
    const data = await res.json();
    setPlanPrompt(data.defaultPrompt);
    setStage("edit-plan-prompt");
  };

  const beginConversation = async () => {
    setStage("planning");
    setChatMessages([]);

    // Send initial message to Sonnet
    const initialMessage = "Please review these notes and propose which TODOs are still relevant, grouped by category. Ask me about anything you're unsure about.";
    setChatMessages([{ role: "user", content: initialMessage }]);
    setIsSending(true);

    try {
      const res = await fetch("/api/obsidian/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: initialMessage }],
          systemPrompt: planPrompt,
          filter: "personal",
        }),
      });
      setChatMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      await readTextStream(res, (text) => {
        setChatMessages((prev) => [
          ...prev.slice(0, -1),
          { role: "assistant", content: text },
        ]);
      });
    } catch (err) {
      console.error("Planning failed:", err);
      setChatMessages((prev) => [
        ...prev.filter((m, i) => i < prev.length - 1 || m.content !== ""),
        { role: "assistant", content: `Error: ${err instanceof Error ? err.message : "failed to get response"}` },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || isSending) return;

    const userMessage = chatInput.trim();
    setChatInput("");
    const updatedMessages = [...chatMessages, { role: "user" as const, content: userMessage }];
    setChatMessages(updatedMessages);
    setIsSending(true);

    try {
      const res = await fetch("/api/obsidian/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages,
          systemPrompt: planPrompt,
          filter: "personal",
        }),
      });
      setChatMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      await readTextStream(res, (text) => {
        setChatMessages((prev) => [
          ...prev.slice(0, -1),
          { role: "assistant", content: text },
        ]);
      });
    } catch (err) {
      console.error("Chat failed:", err);
      setChatMessages((prev) => [
        ...prev.filter((m, i) => i < prev.length - 1 || m.content !== ""),
        { role: "assistant", content: `Error: ${err instanceof Error ? err.message : "failed to get response"}` },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const applyPlan = async () => {
    setStage("applying");

    // Extract the plan from the last assistant message
    const lastAssistant = [...chatMessages]
      .reverse()
      .find((m) => m.role === "assistant");
    const plan = lastAssistant?.content || "";

    try {
      const res = await fetch("/api/obsidian/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          conversationHistory: chatMessages,
        }),
      });
      if (!res.ok) throw new Error(`Apply failed (HTTP ${res.status})`);
      const data = await res.json();
      setApplyResults(data);
      setStage("done");
    } catch (err) {
      console.error("Apply failed:", err);
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error applying the plan: ${err instanceof Error ? err.message : String(err)}. Nothing may have been saved — check and try again.` },
      ]);
      setStage("planning");
    }
  };

  const startManualPlanning = () => {
    const paths = manualFilePaths
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean);
    if (paths.length === 0) return;

    setStage("manual-planning");
    setManualMessages([]);

    const initialMessage = "Please review these notes and propose TODOs. Ask me about anything you're unsure about.";
    setManualMessages([{ role: "user", content: initialMessage }]);
    setManualSending(true);

    fetch("/api/obsidian/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filePaths: paths,
        messages: [{ role: "user", content: initialMessage }],
      }),
    })
      .then(async (res) => {
        setManualMessages((prev) => [...prev, { role: "assistant", content: "" }]);
        await readTextStream(res, (text) => {
          setManualMessages((prev) => [
            ...prev.slice(0, -1),
            { role: "assistant", content: text },
          ]);
        });
      })
      .catch((err) => {
        setManualMessages((prev) => [
          ...prev.filter((m, i) => i < prev.length - 1 || m.content !== ""),
          { role: "assistant", content: `Error: ${err instanceof Error ? err.message : "failed to get response"}` },
        ]);
      })
      .finally(() => setManualSending(false));
  };

  const sendManualMessage = async () => {
    if (!manualInput.trim() || manualSending) return;

    const userMessage = manualInput.trim();
    setManualInput("");
    const updatedMessages = [...manualMessages, { role: "user" as const, content: userMessage }];
    setManualMessages(updatedMessages);
    setManualSending(true);

    const paths = manualFilePaths.split("\n").map((p) => p.trim()).filter(Boolean);

    try {
      const res = await fetch("/api/obsidian/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePaths: paths, messages: updatedMessages }),
      });
      setManualMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      await readTextStream(res, (text) => {
        setManualMessages((prev) => [
          ...prev.slice(0, -1),
          { role: "assistant", content: text },
        ]);
      });
    } catch (err) {
      setManualMessages((prev) => [
        ...prev.filter((m, i) => i < prev.length - 1 || m.content !== ""),
        { role: "assistant", content: `Error: ${err instanceof Error ? err.message : "failed to get response"}` },
      ]);
    } finally {
      setManualSending(false);
    }
  };

  const applyManualPlan = async () => {
    setStage("manual-applying");

    const lastAssistant = [...manualMessages]
      .reverse()
      .find((m) => m.role === "assistant");
    const plan = lastAssistant?.content || "";

    try {
      const res = await fetch("/api/obsidian/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          conversationHistory: manualMessages,
        }),
      });
      if (!res.ok) throw new Error(`Apply failed (HTTP ${res.status})`);
      const data = await res.json();
      setApplyResults(data);
      setStage("manual-done");
    } catch (err) {
      setManualMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error applying the plan: ${err instanceof Error ? err.message : String(err)}. Nothing may have been saved — check and try again.` },
      ]);
      setStage("manual-planning");
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="text-center py-12 text-text-muted animate-pulse">
          Loading Obsidian sync status...
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* ===== OVERVIEW ===== */}
        {stage === "overview" && status && (
          <>
            <div className="incandescent-card p-4 space-y-2">
              <h3 className="heat-3 font-medium">Obsidian Notes</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-text-faint">Total notes</div>
                  <div className="text-lg">{status.totalNotes}</div>
                </div>
                <div>
                  <div className="text-text-faint">Processed</div>
                  <div className="text-lg">{status.totalProcessed}</div>
                </div>
                <div>
                  <div className="text-text-faint">New/modified</div>
                  <div className="text-lg text-accent">{status.newOrModifiedCount}</div>
                </div>
                <div>
                  <div className="text-text-faint">Last run</div>
                  <div className="text-sm">
                    {status.lastRunAt
                      ? new Date(status.lastRunAt).toLocaleDateString()
                      : "Never"}
                  </div>
                </div>
              </div>
            </div>

            {status.personalNotes.length > 0 && (
              <div className="incandescent-card p-4">
                <h3 className="heat-3 font-medium mb-3">
                  Personal TODOs ({status.personalNotes.length} notes)
                </h3>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {status.personalNotes
                    .sort((a, b) => a.filename.localeCompare(b.filename))
                    .map((note) => (
                      <div key={note.filename} className="text-sm">
                        <span className="text-accent">{note.filename}</span>
                        {note.personal_summary && (
                          <span className="text-text-faint ml-2">
                            {note.personal_summary.slice(0, 80)}...
                          </span>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}

            {status.workNotes.length > 0 && (
              <div className="incandescent-card p-4">
                <button
                  onClick={() => setShowWork(!showWork)}
                  className="heat-3 font-medium w-full text-left flex items-center justify-between"
                >
                  <span>Work TODOs ({status.workNotes.length} notes)</span>
                  <span className="text-text-faint text-sm">{showWork ? "hide" : "show"}</span>
                </button>
                {showWork && (
                  <div className="space-y-2 max-h-60 overflow-y-auto mt-3">
                    {status.workNotes
                      .sort((a, b) => a.filename.localeCompare(b.filename))
                      .map((note) => (
                        <div key={note.filename} className="text-sm">
                          <span className="text-text-muted">{note.filename}</span>
                          {note.work_summary && (
                            <span className="text-text-faint ml-2">
                              {note.work_summary.slice(0, 80)}...
                            </span>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              {status.totalProcessed === 0 || status.newOrModifiedCount > 0 ? (
                <button
                  onClick={() => setStage("edit-triage-prompt")}
                  className="incandescent-button bg-accent/20 border-accent text-accent"
                >
                  {status.totalProcessed === 0
                    ? "Run triage"
                    : `Sync ${status.newOrModifiedCount} new notes`}
                </button>
              ) : null}
              {status.personalNotes.length > 0 && (
                <button
                  onClick={startPlanning}
                  className="incandescent-button bg-accent/20 border-accent text-accent"
                >
                  Plan TODOs with Sonnet
                </button>
              )}
              {status.totalProcessed > 0 && (
                <label className="flex items-center gap-2 text-sm text-text-muted">
                  <input
                    type="checkbox"
                    checked={forceReprocess}
                    onChange={(e) => setForceReprocess(e.target.checked)}
                  />
                  Re-triage all
                </label>
              )}
              <button
                onClick={() => setStage("manual-files")}
                className="incandescent-button"
              >
                Process specific files
              </button>
              <button onClick={onCancel} className="incandescent-button text-sm">Back</button>
            </div>
          </>
        )}

        {/* ===== MANUAL FILE INPUT ===== */}
        {stage === "manual-files" && (
          <>
            <div className="incandescent-card p-4">
              <h3 className="heat-3 font-medium mb-3">Process Specific Notes</h3>
              <p className="text-sm text-text-faint mb-3">
                Enter file paths relative to your notes directory, one per line.
                Useful for notes that Haiku didn&apos;t classify correctly.
              </p>
              <textarea
                suppressHydrationWarning
                value={manualFilePaths}
                onChange={(e) => setManualFilePaths(e.target.value)}
                placeholder={"movies-to-watch.md\nrecipes/favorites.md\ntravel-bucket-list.md"}
                className="w-full incandescent-input px-3 py-2 text-sm font-mono resize-y min-h-[150px]"
              />
            </div>
            <div className="flex flex-wrap gap-2 sm:gap-3">
              <button
                onClick={startManualPlanning}
                disabled={!manualFilePaths.trim()}
                className="incandescent-button bg-accent/20 border-accent text-accent disabled:opacity-30"
              >
                Start conversation with Sonnet
              </button>
              <button onClick={() => setStage("overview")} className="incandescent-button">Back</button>
            </div>
          </>
        )}

        {/* ===== MANUAL PLANNING CONVERSATION ===== */}
        {stage === "manual-planning" && (
          <>
            <div className="space-y-4">
              {manualMessages.map((msg, i) => (
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

              {manualSending && (
                <div className="incandescent-card p-4">
                  <div className="text-xs text-text-faint mb-2 uppercase tracking-wider">Sonnet</div>
                  <div className="animate-pulse text-text-muted">Thinking...</div>
                </div>
              )}

              <div ref={manualEndRef} />
            </div>

            <div className="sticky bottom-0 bg-background-primary pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3">
              <div className="flex gap-2">
                <textarea
                  suppressHydrationWarning
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendManualMessage();
                    }
                  }}
                  placeholder="Respond to Sonnet..."
                  disabled={manualSending}
                  rows={2}
                  className="flex-1 incandescent-input px-3 py-2 text-sm resize-none"
                />
                <button
                  onClick={sendManualMessage}
                  disabled={!manualInput.trim() || manualSending}
                  className="incandescent-button self-end disabled:opacity-30"
                >
                  Send
                </button>
              </div>
              <div className="flex flex-wrap gap-2 sm:gap-3">
                <button
                  onClick={applyManualPlan}
                  disabled={manualSending || manualMessages.length < 2}
                  className="incandescent-button bg-accent/20 border-accent text-accent disabled:opacity-30"
                >
                  Apply plan
                </button>
                {manualMessages.length > 0 && (
                  <button
                    onClick={() => {
                      setManualMessages([]);
                      setManualInput("");
                    }}
                    className="incandescent-button text-sm text-text-muted"
                  >
                    Clear chat
                  </button>
                )}
                <button onClick={() => setStage("manual-files")} className="incandescent-button text-sm">
                  Back
                </button>
              </div>
            </div>
          </>
        )}

        {/* ===== MANUAL APPLYING ===== */}
        {stage === "manual-applying" && (
          <div className="text-center py-12">
            <div className="text-4xl mb-4 animate-pulse">&#10022;</div>
            <p className="text-text-muted">Creating TODOs from selected notes...</p>
          </div>
        )}

        {/* ===== MANUAL DONE ===== */}
        {stage === "manual-done" && applyResults && (
          <>
            <div className="incandescent-card p-4">
              <h3 className="heat-3 font-medium mb-3">TODOs Created from Manual Files!</h3>
              <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                <div>
                  <div className="text-text-faint">New lists</div>
                  <div className="text-lg">{applyResults.createdLists.length}</div>
                </div>
                <div>
                  <div className="text-text-faint">New TODOs</div>
                  <div className="text-lg text-accent">{applyResults.createdTodos.length}</div>
                </div>
              </div>

              {applyResults.createdTodos.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs text-text-faint uppercase mb-1">TODOs added:</div>
                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {applyResults.createdTodos.map((t, i) => (
                      <div key={i} className="text-sm">
                        <span className="text-text-faint">[{t.list}]</span>{" "}
                        <span>{t.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {applyResults.errors.length > 0 && (
                <div>
                  <div className="text-xs text-error uppercase mb-1">Errors:</div>
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
              <button onClick={() => setStage("overview")} className="incandescent-button">
                Back to sync
              </button>
            </div>
          </>
        )}

        {/* ===== EDIT TRIAGE PROMPT ===== */}
        {stage === "edit-triage-prompt" && (
          <>
            <div className="incandescent-card p-4">
              <h3 className="heat-3 font-medium mb-3">Triage Prompt (Haiku)</h3>
              <p className="text-sm text-text-faint mb-3">
                Edit the system prompt for classifying each note as personal/work/neither.
              </p>
              <textarea
                suppressHydrationWarning
                value={triagePrompt}
                onChange={(e) => setTriagePrompt(e.target.value)}
                className="w-full incandescent-input px-3 py-2 text-sm font-mono resize-y min-h-[250px]"
              />
            </div>
            <div className="flex flex-wrap gap-2 sm:gap-3">
              <button onClick={runTriage} className="incandescent-button bg-accent/20 border-accent text-accent">
                Run triage{forceReprocess ? " (all notes)" : ""}
              </button>
              <button onClick={() => setStage("overview")} className="incandescent-button">Back</button>
            </div>
          </>
        )}

        {/* ===== TRIAGE RUNNING ===== */}
        {stage === "triage-running" && (
          <div className="text-center py-12">
            <div className="text-4xl mb-4 animate-pulse">&#10022;</div>
            <p className="text-text-muted">Processing notes with Haiku...</p>
            <p className="text-sm text-text-faint mt-2">This may take a few minutes.</p>
          </div>
        )}

        {/* ===== TRIAGE RESULTS ===== */}
        {stage === "triage-results" && triageResults && (
          <>
            <div className="incandescent-card p-4">
              <h3 className="heat-3 font-medium mb-3">Triage Complete</h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-text-faint">Processed</div>
                  <div className="text-lg">{triageResults.processed}</div>
                </div>
                <div>
                  <div className="text-text-faint">Personal</div>
                  <div className="text-lg text-accent">{triageResults.personalCount}</div>
                </div>
                <div>
                  <div className="text-text-faint">Work</div>
                  <div className="text-lg text-text-muted">{triageResults.workCount}</div>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:gap-3">
              <button onClick={startPlanning} className="incandescent-button bg-accent/20 border-accent text-accent">
                Plan TODOs with Sonnet
              </button>
              <button onClick={() => setStage("overview")} className="incandescent-button">
                View details
              </button>
            </div>
          </>
        )}

        {/* ===== EDIT PLAN PROMPT ===== */}
        {stage === "edit-plan-prompt" && (
          <>
            <div className="incandescent-card p-4">
              <h3 className="heat-3 font-medium mb-3">Planning Prompt (Sonnet)</h3>
              <p className="text-sm text-text-faint mb-3">
                Edit the system prompt for the planning conversation. Sonnet will see all
                {status ? ` ${status.personalNotes.length}` : ""} personal notes and this prompt.
                Add any extra context or focus areas.
              </p>
              <textarea
                suppressHydrationWarning
                value={planPrompt}
                onChange={(e) => setPlanPrompt(e.target.value)}
                className="w-full incandescent-input px-3 py-2 text-sm font-mono resize-y min-h-[300px]"
              />
            </div>
            <div className="flex flex-wrap gap-2 sm:gap-3">
              <button onClick={beginConversation} className="incandescent-button bg-accent/20 border-accent text-accent">
                Start conversation
              </button>
              <button onClick={() => setStage("overview")} className="incandescent-button">Back</button>
            </div>
          </>
        )}

        {/* ===== PLANNING CONVERSATION ===== */}
        {stage === "planning" && (
          <>
            {/* Chat messages */}
            <div className="space-y-4">
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
            </div>

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
                      sendChatMessage();
                    }
                  }}
                  placeholder="Respond to Sonnet..."
                  disabled={isSending}
                  rows={2}
                  className="flex-1 incandescent-input px-3 py-2 text-sm resize-none"
                />
                <button
                  onClick={sendChatMessage}
                  disabled={!chatInput.trim() || isSending}
                  className="incandescent-button self-end disabled:opacity-30"
                >
                  Send
                </button>
              </div>
              <div className="flex flex-wrap gap-2 sm:gap-3">
                <button
                  onClick={applyPlan}
                  disabled={isSending || chatMessages.length < 2}
                  className="incandescent-button bg-accent/20 border-accent text-accent disabled:opacity-30"
                >
                  Apply plan
                </button>
                {chatMessages.length > 0 && (
                  <button
                    onClick={() => {
                      setChatMessages([]);
                      setChatInput("");
                    }}
                    className="incandescent-button text-sm text-text-muted"
                  >
                    Clear chat
                  </button>
                )}
                <button onClick={() => setStage("overview")} className="incandescent-button text-sm">
                  Cancel
                </button>
              </div>
            </div>
          </>
        )}

        {/* ===== APPLYING ===== */}
        {stage === "applying" && (
          <div className="text-center py-12">
            <div className="text-4xl mb-4 animate-pulse">&#10022;</div>
            <p className="text-text-muted">Creating TODOs...</p>
            <p className="text-sm text-text-faint mt-2">
              Generating items category by category with Sonnet.
            </p>
          </div>
        )}

        {/* ===== DONE ===== */}
        {stage === "done" && applyResults && (
          <>
            <div className="incandescent-card p-4">
              <h3 className="heat-3 font-medium mb-3">TODOs Created!</h3>
              <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                <div>
                  <div className="text-text-faint">New lists</div>
                  <div className="text-lg">{applyResults.createdLists.length}</div>
                </div>
                <div>
                  <div className="text-text-faint">New TODOs</div>
                  <div className="text-lg text-accent">{applyResults.createdTodos.length}</div>
                </div>
              </div>

              {applyResults.createdLists.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs text-text-faint uppercase mb-1">New lists created:</div>
                  {applyResults.createdLists.map((name) => (
                    <div key={name} className="text-sm text-accent">+ {name}</div>
                  ))}
                </div>
              )}

              {applyResults.createdTodos.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs text-text-faint uppercase mb-1">TODOs added:</div>
                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {applyResults.createdTodos.map((t, i) => (
                      <div key={i} className="text-sm">
                        <span className="text-text-faint">[{t.list}]</span>{" "}
                        <span>{t.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {applyResults.errors.length > 0 && (
                <div>
                  <div className="text-xs text-error uppercase mb-1">Errors:</div>
                  {applyResults.errors.map((e, i) => (
                    <div key={i} className="text-sm text-error">{e}</div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 sm:gap-3">
              <button
                onClick={() => { onComplete(); }}
                className="incandescent-button bg-accent/20 border-accent text-accent"
              >
                Go to Inbox
              </button>
              <button onClick={() => setStage("overview")} className="incandescent-button">
                Back to sync
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
