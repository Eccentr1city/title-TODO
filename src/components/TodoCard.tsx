"use client";

import { useEffect, useRef, useState } from "react";
import type { TodoItem } from "@/lib/types";
import { snoozeOptions } from "@/lib/snooze";
import { TimeInput } from "./TimeInput";

type Props = {
  todo: TodoItem;
  onComplete: (todo: TodoItem) => void;
  onSnooze: (todo: TodoItem, until: Date) => void;
  onEdit: (todo: TodoItem) => void;
  onDelete: (todo: TodoItem) => void;
  onVote?: (todo: TodoItem, direction: "up" | "down") => void;
  priorityHeat?: string;
  listName?: string;
  highlighted?: boolean;
};

const EFFORT = {
  quick: { mark: "~", className: "text-success" },
  medium: { mark: "o", className: "text-accent" },
  deep: { mark: "O", className: "text-heat-6" },
} as const;

function reminderBadge(dateStr: string | null) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  const hours = (date.getTime() - Date.now()) / 3_600_000;
  if (hours < 0) return { text: "Due", urgent: true };
  if (hours < 1) return { text: "< 1h", urgent: true };
  const sameDay = date.toDateString() === new Date().toDateString();
  if (sameDay) return { text: date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }), urgent: hours < 3 };
  const days = Math.ceil(hours / 24);
  if (days <= 1) return { text: "Tomorrow", urgent: false };
  if (days < 7) return { text: date.toLocaleDateString("en-US", { weekday: "short" }), urgent: false };
  return { text: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }), urgent: false };
}

export function TodoCard({ todo, onComplete, onSnooze, onEdit, onDelete, onVote, priorityHeat, listName, highlighted }: Props) {
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const snoozeRef = useRef<HTMLDivElement>(null);
  const done = todo.status === "completed";
  const badge = reminderBadge(todo.nextReminder);

  useEffect(() => {
    if (!snoozeOpen) return;
    const close = (e: PointerEvent) => {
      if (!snoozeRef.current?.contains(e.target as Node)) setSnoozeOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [snoozeOpen]);

  return (
    <div
      id={`todo-${todo.id}`}
      className={`incandescent-card p-4 animate-fade-in scroll-mt-4 ${done ? "opacity-50" : ""} ${priorityHeat ?? ""} ${highlighted ? "highlight-new" : ""}`}
    >
      <div className="flex items-start gap-3">
        {onVote && !done && (
          <div className="flex flex-col items-center flex-shrink-0 -my-1">
            <button onClick={() => onVote(todo, "up")} className="text-[11px] leading-none p-1 text-text-faint hover:text-accent" aria-label="Raise priority">
              &#9650;
            </button>
            <button onClick={() => onVote(todo, "down")} className="text-[11px] leading-none p-1 text-text-faint hover:text-text-muted" aria-label="Lower priority">
              &#9660;
            </button>
          </div>
        )}

        <input
          type="checkbox"
          checked={done}
          onChange={() => onComplete(todo)}
          className="mt-1 flex-shrink-0"
          aria-label={done ? "Mark active" : "Complete"}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className={`leading-snug ${done ? "line-through text-text-muted" : "text-text-normal"}`}>{todo.title}</h3>
            {badge && !done && (
              <span className={`text-xs px-2 py-0.5 border flex-shrink-0 ${badge.urgent ? "border-error text-error" : "border-border text-text-muted"}`}>
                {badge.text}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-2 mt-1 text-xs text-text-faint">
            {listName && <span className="text-text-muted">{listName}</span>}
            {todo.effort && <span className={EFFORT[todo.effort].className}>{EFFORT[todo.effort].mark}</span>}
            {todo.reminderCadence && <span title="Repeats">&#8635; {todo.reminderCadence}</span>}
            {todo.tags?.length > 0 && <span>{todo.tags.map((t) => `#${t}`).join(" ")}</span>}
          </div>

          {todo.content && <p className="mt-2 text-sm text-text-muted line-clamp-2">{todo.content}</p>}

          <div className="flex items-center gap-2 mt-3">
            {!done && (
              <div className="relative" ref={snoozeRef}>
                <button onClick={() => setSnoozeOpen(!snoozeOpen)} className="incandescent-button text-xs py-1.5 sm:py-1 px-3 sm:px-2">
                  Snooze
                </button>
                {snoozeOpen && (
                  <div className="absolute top-full left-0 mt-1 bg-background-tertiary border border-border z-50 w-64 shadow-glow">
                    {snoozeOptions().map((o) => (
                      <button
                        key={o.label}
                        onClick={() => { onSnooze(todo, o.until); setSnoozeOpen(false); }}
                        className="w-full text-left px-3 py-3 sm:py-2 text-sm hover:bg-background-secondary active:bg-background-secondary"
                      >
                        {o.label}
                      </button>
                    ))}
                    <TimeInput
                      className="p-2 border-t border-border"
                      onResolved={(when) => { onSnooze(todo, when); setSnoozeOpen(false); }}
                    />
                  </div>
                )}
              </div>
            )}
            <button onClick={() => onEdit(todo)} className="incandescent-button text-xs py-1.5 sm:py-1 px-3 sm:px-2">
              Edit
            </button>
            <button
              onClick={() => onDelete(todo)}
              className="incandescent-button text-xs py-1.5 sm:py-1 px-3 sm:px-2 hover:border-error hover:text-error"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
