import { z } from "zod";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { db } from "@/db";
import { lists, todos, type List, type Todo } from "@/db/schema";

// Shapes the model fills in when creating todos (magic input, Obsidian apply),
// enforced by structured outputs. Descriptions are sent with the schema.

export const ListSpec = z.object({
  listName: z.string().describe("Existing list name to reuse, or the name of a new list"),
  listIsNew: z.boolean(),
  listSummary: z.string().nullable().describe("Only for new lists: what goes in this list"),
  listTags: z.array(z.string()),
  listIsTimeBound: z.boolean(),
});

export const TodoSpec = z.object({
  title: z.string(),
  content: z.string().nullable(),
  nextReminder: z
    .string()
    .nullable()
    .describe("ISO 8601 local time with UTC offset, e.g. 2026-10-12T09:00:00-07:00"),
  reminderCadence: z.string().nullable().describe("daily / weekly / monthly, or null"),
  tags: z.array(z.string()),
  effort: z.enum(["quick", "medium", "deep"]).nullable(),
});

export type ListSpec = z.infer<typeof ListSpec>;
export type TodoSpec = z.infer<typeof TodoSpec> & { sourceRef?: string | null };

export type ImportResult = { createdLists: List[]; createdTodos: Todo[]; errors: string[] };

function parseReminder(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Finds each group's list by name (case-insensitive) or creates it, then
// inserts its todos — all in one transaction, so a failure leaves nothing
// half-imported.
export function importTodos(
  groups: { list: ListSpec; items: TodoSpec[] }[],
  opts: { source: Todo["source"]; skipDuplicates?: boolean }
): ImportResult {
  return db.transaction((tx) => {
    const knownLists = tx.select().from(lists).all();
    const activeTodos = opts.skipDuplicates
      ? tx
          .select({ listId: todos.listId, title: todos.title })
          .from(todos)
          .where(eq(todos.status, "active"))
          .all()
      : [];
    const result: ImportResult = { createdLists: [], createdTodos: [], errors: [] };

    for (const { list: spec, items } of groups) {
      const name = spec.listName.trim();
      if (!name) {
        result.errors.push("Skipped a group with no list name");
        continue;
      }

      let list = knownLists.find((l) => l.name.toLowerCase() === name.toLowerCase());
      if (!list) {
        list = {
          id: uuid(),
          name,
          summary: spec.listSummary || `Items related to ${name}`,
          tags: spec.listTags,
          isTimeBound: spec.listIsTimeBound,
          createdAt: new Date(),
          itemCount: 0,
        };
        tx.insert(lists).values(list).run();
        knownLists.push(list);
        result.createdLists.push(list);
      }

      for (const item of items) {
        const title = item.title.trim();
        if (!title) continue;
        const listId = list.id;
        if (
          opts.skipDuplicates &&
          activeTodos.some((t) => t.listId === listId && t.title.toLowerCase() === title.toLowerCase())
        ) {
          continue;
        }

        const todo: Todo = {
          id: uuid(),
          title,
          content: item.content || null,
          listId,
          createdAt: new Date(),
          nextReminder: parseReminder(item.nextReminder),
          notifiedReminder: null,
          reminderCadence: item.reminderCadence || null,
          status: "active",
          completedAt: null,
          source: opts.source,
          sourceRef: item.sourceRef || null,
          tags: item.tags,
          effort: item.effort,
          manualPriority: 0,
        };
        tx.insert(todos).values(todo).run();
        activeTodos.push({ listId, title });
        result.createdTodos.push(todo);
      }
    }
    return result;
  });
}
