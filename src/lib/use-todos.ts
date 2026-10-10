"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, pollWhileVisible } from "./api";
import { computeVotePriority } from "./priority";
import type { TodoItem, TodoList } from "./types";
import type { ModelTier } from "./models";

export type MagicResult = { todos: TodoItem[]; lists: TodoList[] };

const isDue = (t: TodoItem, now = Date.now()) =>
  t.status === "active" && !!t.nextReminder && new Date(t.nextReminder).getTime() <= now;

// All todo/list state and the mutations on it. Item counts are derived from
// the todos rather than patched by hand after every change.
export function useTodos() {
  const [rawLists, setRawLists] = useState<TodoList[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const [lists, active, completed] = await Promise.all([
      api<TodoList[]>("/api/lists"),
      api<TodoItem[]>("/api/todos?status=active"),
      api<TodoItem[]>("/api/todos?status=completed"),
    ]);
    setRawLists(lists);
    setTodos([...active, ...completed]);
    setLoaded(true);
  }, []);

  useEffect(() => pollWhileVisible(() => { refresh().catch(console.error); }, 30_000), [refresh]);

  const lists = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of todos) if (t.status === "active") counts.set(t.listId, (counts.get(t.listId) ?? 0) + 1);
    return rawLists.map((l) => ({ ...l, itemCount: counts.get(l.id) ?? 0 }));
  }, [rawLists, todos]);

  const replace = (updated: TodoItem) =>
    setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));

  const patch = async (id: string, body: Partial<TodoItem>) => {
    const updated = await api<TodoItem>(`/api/todos/${id}`, { method: "PATCH", body });
    replace(updated);
    return updated;
  };

  return {
    lists,
    todos,
    loaded,
    refresh,
    dueCount: todos.filter((t) => isDue(t)).length,

    // Returns the updated todo; a recurring one comes back still active with
    // its next reminder.
    toggleComplete: (todo: TodoItem) =>
      patch(todo.id, { status: todo.status === "completed" ? "active" : "completed" }),

    snooze: (id: string, until: Date) => patch(id, { nextReminder: until.toISOString() }),

    save: (id: string, updates: Partial<TodoItem>) => patch(id, updates),

    // Deleting moves a todo to the trash (status "archived"); the returned
    // function restores it.
    trash: async (todo: TodoItem) => {
      await patch(todo.id, { status: "archived" });
      return () => patch(todo.id, { status: todo.status });
    },

    vote: async (todo: TodoItem, direction: "up" | "down", visible: TodoItem[]) => {
      const manualPriority = computeVotePriority(todo, direction, visible);
      replace({ ...todo, manualPriority });
      await patch(todo.id, { manualPriority });
    },

    magic: async (input: string, model: ModelTier): Promise<MagicResult> => {
      const result = await api<MagicResult>("/api/magic", { body: { input, model } });
      setRawLists((prev) => [...prev, ...result.lists]);
      setTodos((prev) => [...prev, ...result.todos]);
      return result;
    },

    undoMagic: async (result: MagicResult) => {
      const { deletedTodoIds, deletedListIds } = await api<{ deletedTodoIds: string[]; deletedListIds: string[] }>(
        "/api/magic/undo",
        { body: { todoIds: result.todos.map((t) => t.id), listIds: result.lists.map((l) => l.id) } }
      );
      setTodos((prev) => prev.filter((t) => !deletedTodoIds.includes(t.id)));
      setRawLists((prev) => prev.filter((l) => !deletedListIds.includes(l.id)));
    },
  };
}

export { isDue };
