import { eq } from "drizzle-orm";
import { db } from "@/db";
import { lists, todos } from "@/db/schema";

// Plain-text summaries of the current lists and active todos, for prompts that
// need to place new items or avoid duplicates.
export function listsAndTodosContext() {
  const allLists = db.select().from(lists).all();
  const activeTodos = db.select().from(todos).where(eq(todos.status, "active")).all();
  const nameById = new Map(allLists.map((l) => [l.id, l.name]));

  const listsContext =
    allLists
      .map((l) => {
        const count = activeTodos.filter((t) => t.listId === l.id).length;
        const kind = l.isTimeBound ? "time-bound" : "timeless";
        return `- "${l.name}" (${kind}): ${l.summary || "no description"} [${count} items]`;
      })
      .join("\n") || "(none)";

  const todosContext =
    activeTodos.map((t) => `- [${nameById.get(t.listId) ?? "?"}] ${t.title}`).join("\n") || "(none)";

  return { lists: allLists, todos: activeTodos, listsContext, todosContext };
}
