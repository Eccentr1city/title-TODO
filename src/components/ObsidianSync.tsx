"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Chat, type ChatMessage } from "./Chat";
import { ResultCard } from "./ResultCard";

type TriageNote = {
  filename: string;
  has_personal: boolean;
  has_work: boolean;
  personal_summary: string;
  work_summary: string;
};

type Status = {
  lastRunAt: string;
  triagePrompt: string;
  totalProcessed: number;
  totalNotes: number;
  newOrModifiedCount: number;
  personalNotes: TriageNote[];
  workNotes: TriageNote[];
  vaultAvailable: boolean;
};

type ApplyResult = {
  createdLists: string[];
  createdTodos: { list: string; title: string }[];
  errors: string[];
};

type Filter = "personal" | "work" | "both";

type Stage =
  | { name: "overview" }
  | { name: "plan"; filter: Filter }
  | { name: "files"; filePaths: string[] }
  | { name: "done"; result: ApplyResult };

const btn = "incandescent-button";
const primary = "incandescent-button bg-accent/20 border-accent text-accent disabled:opacity-30";

// Import TODOs from the Obsidian vault: triage notes with Haiku, plan with
// Sonnet in a conversation, then apply the agreed plan.
export function ObsidianSync({ onApplied, onDone }: { onApplied: () => void; onDone: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [stage, setStage] = useState<Stage>({ name: "overview" });
  const [error, setError] = useState<string | null>(null);

  // Overview controls
  const [triagePrompt, setTriagePrompt] = useState("");
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [force, setForce] = useState(false);
  const [triaging, setTriaging] = useState(false);
  const [triageSummary, setTriageSummary] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("personal");
  const [filePaths, setFilePaths] = useState("");
  const [applying, setApplying] = useState(false);

  const loadStatus = async () => {
    try {
      const s = await api<Status>("/api/obsidian");
      setStatus(s);
      setTriagePrompt(s.triagePrompt);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const runTriage = async () => {
    setTriaging(true);
    setError(null);
    try {
      const r = await api<{ processed: number; personalCount?: number; workCount?: number; message?: string }>(
        "/api/obsidian",
        { body: { prompt: triagePrompt, force } }
      );
      setTriageSummary(
        r.message ?? `Triaged ${r.processed} notes: ${r.personalCount} with personal TODOs, ${r.workCount} with work TODOs.`
      );
      setEditingPrompt(false);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTriaging(false);
    }
  };

  const apply = async (messages: ChatMessage[]) => {
    const plan = [...messages].reverse().find((m) => m.role === "assistant")?.content;
    if (!plan) return;
    setApplying(true);
    setError(null);
    try {
      const result = await api<ApplyResult>("/api/obsidian/apply", { body: { plan } });
      setStage({ name: "done", result });
      onApplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplying(false);
    }
  };

  const chatActions = (messages: ChatMessage[], busy: boolean) => (
    <>
      <button onClick={() => apply(messages)} disabled={busy || applying || messages.length < 2} className={primary}>
        {applying ? "Creating TODOs…" : "Apply plan"}
      </button>
      <button onClick={() => setStage({ name: "overview" })} disabled={applying} className={btn}>
        Back
      </button>
      {error && <span className="text-sm text-error self-center">{error}</span>}
    </>
  );

  if (stage.name === "plan") {
    return (
      <Chat
        endpoint="/api/obsidian/plan"
        body={{ filter: stage.filter }}
        opening="Please review these notes and propose which TODOs are still relevant, grouped by category. Ask me about anything you're unsure about."
        placeholder="Reply to Sonnet…"
        actions={chatActions}
      />
    );
  }

  if (stage.name === "files") {
    return (
      <Chat
        endpoint="/api/obsidian/manual"
        body={{ filePaths: stage.filePaths }}
        opening="Please review these notes and propose TODOs. Ask me about anything you're unsure about."
        placeholder="Reply to Sonnet…"
        actions={chatActions}
      />
    );
  }

  if (stage.name === "done") {
    const { result } = stage;
    return (
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          <ResultCard
            title={`Created ${result.createdTodos.length} TODOs${result.createdLists.length ? ` and ${result.createdLists.length} new lists` : ""}`}
            lines={[
              ...result.createdLists.map((name) => `New list: ${name}`),
              ...result.createdTodos.map((t) => `[${t.list}] ${t.title}`),
            ]}
            errors={result.errors}
          />
          <div className="flex flex-wrap gap-2">
            <button onClick={onDone} className={primary}>Go to Inbox</button>
            <button onClick={() => setStage({ name: "overview" })} className={btn}>Back to sync</button>
          </div>
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex-1 p-6 text-center text-text-muted">
        {error ?? <span className="animate-pulse">Loading…</span>}
      </div>
    );
  }

  const vault = status.vaultAvailable;
  const notesFor = (f: Filter) =>
    f === "personal"
      ? status.personalNotes
      : f === "work"
        ? status.workNotes
        : [...new Map([...status.personalNotes, ...status.workNotes].map((n) => [n.filename, n])).values()];

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        {!vault && (
          <div className="border border-border p-3 text-sm text-text-muted">
            The notes vault isn&apos;t reachable from this server, so triage and planning are unavailable here. Past
            triage results are shown below.
          </div>
        )}

        <div className="incandescent-card p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Stat label="Notes" value={vault ? status.totalNotes : "—"} />
            <Stat label="Triaged" value={status.totalProcessed} />
            <Stat label="New / modified" value={vault ? status.newOrModifiedCount : "—"} accent />
            <Stat label="Last run" value={status.lastRunAt ? new Date(status.lastRunAt).toLocaleDateString() : "never"} />
          </div>
        </div>

        {/* Triage */}
        <section className="incandescent-card p-4 space-y-3">
          <h3 className="heat-3">1. Triage</h3>
          <p className="text-sm text-text-muted">
            Haiku reads each new or changed note and flags the ones containing personal or work TODOs.
          </p>
          {editingPrompt && (
            <textarea
              suppressHydrationWarning
              value={triagePrompt}
              onChange={(e) => setTriagePrompt(e.target.value)}
              className="w-full incandescent-input px-3 py-2 text-sm font-mono resize-y min-h-[240px]"
            />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={runTriage} disabled={!vault || triaging} className={primary}>
              {triaging
                ? "Triaging…"
                : force
                  ? "Re-triage all notes"
                  : `Triage ${status.newOrModifiedCount} new notes`}
            </button>
            <button onClick={() => setEditingPrompt(!editingPrompt)} className={btn}>
              {editingPrompt ? "Hide prompt" : "Edit prompt"}
            </button>
            <label className="flex items-center gap-2 text-sm text-text-muted">
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
              Re-triage all
            </label>
          </div>
          {triageSummary && <p className="text-sm text-accent">{triageSummary}</p>}
        </section>

        {/* Plan */}
        <section className="incandescent-card p-4 space-y-3">
          <h3 className="heat-3">2. Plan with Sonnet</h3>
          <div className="flex flex-wrap gap-2 text-sm">
            {(["personal", "work", "both"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 border ${filter === f ? "border-accent text-accent bg-accent/10" : "border-border text-text-muted"}`}
              >
                {f} ({notesFor(f).length})
              </button>
            ))}
          </div>
          <div className="max-h-56 overflow-y-auto space-y-1 text-sm">
            {notesFor(filter)
              .sort((a, b) => a.filename.localeCompare(b.filename))
              .map((n) => (
                <div key={n.filename} className="truncate">
                  <span className="text-accent">{n.filename}</span>
                  <span className="text-text-faint ml-2">
                    {filter === "work" ? n.work_summary : n.personal_summary || n.work_summary}
                  </span>
                </div>
              ))}
          </div>
          <button onClick={() => setStage({ name: "plan", filter })} disabled={!vault || notesFor(filter).length === 0} className={primary}>
            Start planning
          </button>
        </section>

        {/* Specific files */}
        <section className="incandescent-card p-4 space-y-3">
          <h3 className="heat-3">Or: specific notes</h3>
          <p className="text-sm text-text-muted">Paths relative to the vault, one per line — for notes triage missed.</p>
          <textarea
            suppressHydrationWarning
            value={filePaths}
            onChange={(e) => setFilePaths(e.target.value)}
            placeholder={"movies-to-watch.md\nrecipes/favorites.md"}
            className="w-full incandescent-input px-3 py-2 text-sm font-mono resize-y min-h-[90px]"
          />
          <button
            onClick={() =>
              setStage({ name: "files", filePaths: filePaths.split("\n").map((p) => p.trim()).filter(Boolean) })
            }
            disabled={!vault || !filePaths.trim()}
            className={primary}
          >
            Start conversation
          </button>
        </section>

        {error && <p className="text-sm text-error">{error}</p>}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div>
      <div className="text-text-faint">{label}</div>
      <div className={`text-lg ${accent ? "text-accent" : ""}`}>{value}</div>
    </div>
  );
}
