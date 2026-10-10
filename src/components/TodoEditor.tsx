"use client";

import { useEffect, useState } from "react";
import type { TodoItem, TodoList } from "@/lib/types";

type Props = {
  todo: TodoItem | null;
  lists: TodoList[];
  onSave: (id: string, updates: Partial<TodoItem>) => void;
  onClose: () => void;
};

const CADENCES = [
  { value: "", label: "Doesn't repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "2 weeks", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

const EFFORTS = [
  { value: "quick", label: "~ Quick", color: "text-success" },
  { value: "medium", label: "o Medium", color: "text-accent" },
  { value: "deep", label: "O Deep", color: "text-heat-6" },
] as const;

// <input type="datetime-local"> works in local wall-clock time without a zone,
// so convert explicitly in both directions (an ISO string sliced to 16 chars
// would be UTC, shifting the reminder by the UTC offset on every save).
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TodoEditor({ todo, lists, onSave, onClose }: Props) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [listId, setListId] = useState("");
  const [reminder, setReminder] = useState("");
  const [cadence, setCadence] = useState("");
  const [effort, setEffort] = useState<TodoItem["effort"]>(null);

  useEffect(() => {
    if (!todo) return;
    setTitle(todo.title);
    setContent(todo.content ?? "");
    setListId(todo.listId);
    setReminder(toLocalInput(todo.nextReminder));
    setCadence(todo.reminderCadence ?? "");
    setEffort(todo.effort);
  }, [todo]);

  useEffect(() => {
    if (!todo) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [todo, onClose]);

  if (!todo) return null;

  const save = () => {
    if (!title.trim()) return;
    onSave(todo.id, {
      title: title.trim(),
      content: content.trim() || null,
      listId,
      nextReminder: reminder ? new Date(reminder).toISOString() : null,
      reminderCadence: cadence || null,
      effort,
    });
    onClose();
  };

  const cadences = CADENCES.some((c) => c.value === cadence) ? CADENCES : [...CADENCES, { value: cadence, label: cadence }];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 sm:p-4" onClick={onClose}>
      <div
        className="bg-background-secondary border border-border w-full max-w-lg max-h-[90%] overflow-y-auto pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg heat-2">Edit</h2>
          <button onClick={onClose} className="text-text-muted hover:text-accent text-xl px-2" aria-label="Close">
            &times;
          </button>
        </div>

        <div className="p-4 space-y-4">
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full incandescent-input px-3 py-2" />
          </Field>

          <Field label="Notes">
            <textarea
              suppressHydrationWarning
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              className="w-full incandescent-input px-3 py-2 resize-y"
            />
          </Field>

          <Field label="List">
            <select value={listId} onChange={(e) => setListId(e.target.value)} className="w-full incandescent-input px-3 py-2">
              {lists.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Reminder">
              <div className="flex gap-2">
                <input
                  type="datetime-local"
                  value={reminder}
                  onChange={(e) => setReminder(e.target.value)}
                  className="flex-1 min-w-0 incandescent-input px-3 py-2"
                />
                {reminder && (
                  <button onClick={() => setReminder("")} className="incandescent-button px-3" aria-label="Clear reminder">
                    &times;
                  </button>
                )}
              </div>
            </Field>
            <Field label="Repeats">
              <select value={cadence} onChange={(e) => setCadence(e.target.value)} className="w-full incandescent-input px-3 py-2">
                {cadences.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Effort">
            <div className="flex gap-2">
              {EFFORTS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setEffort(effort === o.value ? null : o.value)}
                  className={`flex-1 py-2 border ${effort === o.value ? `border-accent ${o.color} bg-background-tertiary` : "border-border text-text-muted"}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button onClick={onClose} className="incandescent-button">Cancel</button>
          <button onClick={save} disabled={!title.trim()} className="incandescent-button bg-accent/20 border-accent text-accent disabled:opacity-30">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-sm text-text-muted mb-1">{label}</div>
      {children}
    </div>
  );
}
