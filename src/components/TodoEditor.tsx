"use client";

import { useState, useEffect } from "react";
import { TodoItem, TodoList } from "@/lib/types";

interface TodoEditorProps {
  todo: TodoItem | null;
  lists: TodoList[];
  onSave: (todo: Partial<TodoItem> & { id: string }) => void;
  onClose: () => void;
}

export function TodoEditor({ todo, lists, onSave, onClose }: TodoEditorProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [listId, setListId] = useState("");
  const [nextReminder, setNextReminder] = useState("");
  const [reminderCadence, setReminderCadence] = useState("");
  const [effort, setEffort] = useState<"quick" | "medium" | "deep" | "">("");

  useEffect(() => {
    if (todo) {
      setTitle(todo.title);
      setContent(todo.content || "");
      setListId(todo.listId);
      setNextReminder(todo.nextReminder ? todo.nextReminder.slice(0, 16) : "");
      setReminderCadence(todo.reminderCadence || "");
      setEffort(todo.effort || "");
    }
  }, [todo]);

  if (!todo) return null;

  const handleSave = () => {
    onSave({
      id: todo.id,
      title,
      content: content || null,
      listId,
      nextReminder: nextReminder ? new Date(nextReminder).toISOString() : null,
      reminderCadence: reminderCadence || null,
      effort: effort || null,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-background-secondary border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg heat-2">Edit TODO</h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-accent transition-colors text-xl"
          >
            x
          </button>
        </div>

        {/* Form */}
        <div className="p-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm text-text-muted mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full incandescent-input px-3 py-2"
            />
          </div>

          {/* Content */}
          <div>
            <label className="block text-sm text-text-muted mb-1">Notes</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              className="w-full incandescent-input px-3 py-2 resize-none"
            />
          </div>

          {/* List */}
          <div>
            <label className="block text-sm text-text-muted mb-1">List</label>
            <select
              value={listId}
              onChange={(e) => setListId(e.target.value)}
              className="w-full incandescent-input px-3 py-2"
            >
              {lists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
          </div>

          {/* Reminder */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-muted mb-1">Next Reminder</label>
              <input
                type="datetime-local"
                value={nextReminder}
                onChange={(e) => setNextReminder(e.target.value)}
                className="w-full incandescent-input px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-text-muted mb-1">Cadence</label>
              <select
                value={reminderCadence}
                onChange={(e) => setReminderCadence(e.target.value)}
                className="w-full incandescent-input px-3 py-2"
              >
                <option value="">One-time</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="2 weeks">Every 2 weeks</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>

          {/* Effort */}
          <div>
            <label className="block text-sm text-text-muted mb-1">Effort</label>
            <div className="flex gap-2">
              {[
                { value: "quick", label: "~ Quick", color: "text-success" },
                { value: "medium", label: "o Medium", color: "text-accent" },
                { value: "deep", label: "O Deep", color: "text-heat-6" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setEffort(opt.value as typeof effort)}
                  className={`flex-1 py-2 border transition-all
                             ${effort === opt.value 
                               ? `border-accent ${opt.color} bg-background-tertiary` 
                               : "border-border text-text-muted hover:border-border-hover"}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button onClick={onClose} className="incandescent-button">
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="incandescent-button bg-accent/20 border-accent text-accent"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

