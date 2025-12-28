"use client";

import { useState, useRef, useEffect } from "react";
import { TodoItem } from "@/lib/types";

interface TodoCardProps {
  todo: TodoItem;
  onComplete: (id: string) => void;
  onSnooze: (id: string, until: Date) => void;
  onEdit: (todo: TodoItem) => void;
  onDelete: (id: string) => void;
  showListName?: string;
}

const SNOOZE_OPTIONS = [
  { label: "+1 hour", hours: 1 },
  { label: "+3 hours", hours: 3 },
  { label: "+1 day", hours: 24 },
  { label: "+3 days", hours: 72 },
  { label: "+1 week", hours: 168 },
];

export function TodoCard({ todo, onComplete, onSnooze, onEdit, onDelete, showListName }: TodoCardProps) {
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false);
  const snoozeRef = useRef<HTMLDivElement>(null);

  // Close snooze menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (snoozeRef.current && !snoozeRef.current.contains(e.target as Node)) {
        setShowSnoozeMenu(false);
      }
    };
    if (showSnoozeMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSnoozeMenu]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (hours < 0) return { text: "Overdue", urgent: true };
    if (hours < 1) return { text: "< 1 hour", urgent: true };
    if (hours < 24) return { text: `${hours}h`, urgent: hours < 3 };
    if (days === 0) return { text: "Today", urgent: true };
    if (days === 1) return { text: "Tomorrow", urgent: false };
    if (days < 7) return { text: date.toLocaleDateString("en-US", { weekday: "short" }), urgent: false };
    return { text: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }), urgent: false };
  };

  const handleSnooze = (hours: number) => {
    const until = new Date();
    until.setTime(until.getTime() + hours * 60 * 60 * 1000);
    onSnooze(todo.id, until);
    setShowSnoozeMenu(false);
  };

  const reminder = formatDate(todo.nextReminder);

  return (
    <div 
      className={`incandescent-card p-4 animate-fade-in
                  ${todo.status === "completed" ? "opacity-50" : ""}`}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={todo.status === "completed"}
          onChange={() => onComplete(todo.id)}
          className="mt-1 flex-shrink-0"
        />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 
              className={`font-medium leading-snug
                         ${todo.status === "completed" ? "line-through text-text-muted" : "text-text-normal"}`}
            >
              {todo.title}
            </h3>
            
            {/* Reminder badge */}
            {reminder && (
              <span className={`text-xs px-2 py-0.5 border flex-shrink-0
                               ${reminder.urgent 
                                 ? "border-error text-error" 
                                 : "border-border text-text-muted"}`}>
                {reminder.text}
              </span>
            )}
          </div>

          {/* Meta line */}
          <div className="flex items-center gap-2 mt-1 text-xs text-text-faint">
            {showListName && (
              <span className="text-text-muted">{showListName}</span>
            )}
            {todo.effort && (
              <span className={`
                ${todo.effort === "quick" ? "text-success" : ""}
                ${todo.effort === "medium" ? "text-accent" : ""}
                ${todo.effort === "deep" ? "text-heat-6" : ""}
              `}>
                {todo.effort === "quick" && "~"}
                {todo.effort === "medium" && "o"}
                {todo.effort === "deep" && "O"}
              </span>
            )}
            {todo.tags && todo.tags.length > 0 && (
              <span className="text-text-faint">
                {todo.tags.map(t => `#${t}`).join(" ")}
              </span>
            )}
          </div>

          {/* Content preview */}
          {todo.content && (
            <p className="mt-2 text-sm text-text-muted line-clamp-2">
              {todo.content}
            </p>
          )}

          {/* Action buttons - always visible */}
          <div className="flex items-center gap-2 mt-3">
            {/* Snooze dropdown */}
            <div className="relative" ref={snoozeRef}>
              <button
                onClick={() => setShowSnoozeMenu(!showSnoozeMenu)}
                className="incandescent-button text-xs py-1 px-2"
              >
                Snooze
              </button>
              {showSnoozeMenu && (
                <div className="absolute top-full left-0 mt-1 bg-background-tertiary border border-border z-50 min-w-[100px]">
                  {SNOOZE_OPTIONS.map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => handleSnooze(opt.hours)}
                      className="w-full text-left px-3 py-2 text-sm text-text-normal 
                                 hover:bg-background-secondary transition-colors"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Edit button */}
            <button
              onClick={() => onEdit(todo)}
              className="incandescent-button text-xs py-1 px-2"
            >
              Edit
            </button>

            {/* Delete button */}
            <button
              onClick={() => onDelete(todo.id)}
              className="incandescent-button text-xs py-1 px-2 hover:border-error hover:text-error"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
