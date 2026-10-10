import type { List, Todo } from "@/db/schema";
import type { TodoItem, TodoList } from "./types";

// DB rows → the JSON shapes the frontend uses (dates as ISO strings).

export function todoJSON(t: Todo): TodoItem {
  return {
    id: t.id,
    title: t.title,
    content: t.content,
    listId: t.listId,
    createdAt: t.createdAt.toISOString(),
    nextReminder: t.nextReminder?.toISOString() ?? null,
    reminderCadence: t.reminderCadence,
    status: t.status,
    completedAt: t.completedAt?.toISOString() ?? null,
    source: t.source,
    sourceRef: t.sourceRef,
    tags: t.tags ?? [],
    effort: t.effort,
    manualPriority: t.manualPriority ?? 0,
  };
}

export function listJSON(l: List, itemCount = l.itemCount): TodoList {
  return {
    id: l.id,
    name: l.name,
    summary: l.summary,
    tags: l.tags ?? [],
    isTimeBound: l.isTimeBound,
    createdAt: l.createdAt.toISOString(),
    itemCount,
  };
}
