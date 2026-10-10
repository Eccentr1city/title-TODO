"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { TodoList } from "@/lib/types";

type Props = {
  list: TodoList | null;
  categories: string[];
  onSaved: () => void;
  onDeleted: () => void;
  onClose: () => void;
};

const NEW = "__new__";

// Rename, describe, recategorize or delete a list — the touch-friendly
// counterpart to the sidebar's double-click and drag.
export function ListEditor({ list, categories, onSaved, onDeleted, onClose }: Props) {
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [category, setCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [timeless, setTimeless] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!list) return;
    setName(list.name);
    setSummary(list.summary);
    setCategory(list.tags[0] ?? "");
    setNewCategory("");
    setTimeless(!list.isTimeBound);
    setConfirmDelete(false);
    setError(null);
  }, [list]);

  if (!list) return null;

  const chosenCategory = category === NEW ? newCategory.trim() : category;

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    act(async () => {
      await api(`/api/lists/${list.id}`, {
        method: "PATCH",
        body: { name: name.trim(), summary, category: chosenCategory || null, isTimeBound: !timeless },
      });
      onSaved();
      onClose();
    });

  const remove = () =>
    act(async () => {
      await api(`/api/lists/${list.id}`, { method: "DELETE" });
      onDeleted();
      onClose();
    });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 sm:p-4" onClick={onClose}>
      <div
        className="bg-background-secondary border border-border w-full max-w-lg max-h-[90%] overflow-y-auto pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg heat-2">Edit list</h2>
          <button onClick={onClose} className="text-text-muted hover:text-accent text-xl px-2" aria-label="Close">
            &times;
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <div className="text-sm text-text-muted mb-1">Name</div>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full incandescent-input px-3 py-2" />
          </div>

          <div>
            <div className="text-sm text-text-muted mb-1">Description</div>
            <textarea
              suppressHydrationWarning
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={2}
              className="w-full incandescent-input px-3 py-2 resize-y"
            />
          </div>

          <div>
            <div className="text-sm text-text-muted mb-1">Category</div>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full incandescent-input px-3 py-2">
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c} value={c}>#{c}</option>
              ))}
              <option value={NEW}>New category…</option>
            </select>
            {category === NEW && (
              <input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Category name"
                className="w-full incandescent-input px-3 py-2 mt-2"
                autoFocus
              />
            )}
          </div>

          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={timeless} onChange={(e) => setTimeless(e.target.checked)} className="mt-0.5" />
            <span>
              Timeless
              <span className="block text-text-faint">Things to enjoy or consider someday (books, films, ideas) — no reminders.</span>
            </span>
          </label>

          <div className="pt-2 border-t border-border">
            {confirmDelete ? (
              <div className="space-y-2">
                <p className="text-sm text-error">
                  Delete &quot;{list.name}&quot; and everything in it
                  {list.itemCount ? ` (${list.itemCount} active ${list.itemCount === 1 ? "item" : "items"}, plus any completed)` : ""}?
                  This can&apos;t be undone.
                </p>
                <div className="flex gap-2">
                  <button onClick={remove} disabled={busy} className="incandescent-button border-error text-error">
                    Delete list
                  </button>
                  <button onClick={() => setConfirmDelete(false)} className="incandescent-button">Keep it</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="text-sm text-text-muted hover:text-error">
                Delete this list…
              </button>
            )}
          </div>

          {error && <p className="text-sm text-error">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button onClick={onClose} className="incandescent-button">Cancel</button>
          <button
            onClick={save}
            disabled={busy || !name.trim() || (category === NEW && !newCategory.trim())}
            className="incandescent-button bg-accent/20 border-accent text-accent disabled:opacity-30"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
