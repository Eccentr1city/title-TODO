import { z } from "zod";
import { v4 as uuid } from "uuid";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { lists, todos, type NewList, type NewTodo } from "@/db/schema";
import { loadPrompt } from "./prompts";
import { localDateISO } from "./dates";

// List reorganization: the refactor chat discusses changes in prose, and
// Implement extracts them as typed actions (structured outputs) and applies
// each in its own transaction.

const Tags = z.array(z.string());
const Effort = z.enum(["quick", "medium", "deep"]);

export const RefactorAction = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("edit"),
    listId: z.string(),
    newName: z.string().nullable(),
    newSummary: z.string().nullable(),
    newTags: Tags.nullable(),
  }),
  z.object({
    action: z.literal("merge"),
    listIds: z.array(z.string()),
    newName: z.string(),
    newSummary: z.string(),
    newTags: Tags.nullable().describe("null: union of the source lists' tags"),
  }),
  z.object({
    action: z.literal("split"),
    listId: z.string(),
    splits: z.array(
      z.object({
        newName: z.string(),
        newSummary: z.string(),
        newTags: Tags.nullable(),
        isTimeBound: z.boolean().nullable(),
        itemTitles: z.array(z.string()),
      })
    ),
  }),
  z.object({
    action: z.literal("move"),
    listId: z.string(),
    targetListId: z.string(),
    itemTitles: z.array(z.string()).describe("Empty: move every item"),
  }),
  z.object({
    action: z.literal("delete"),
    listIds: z.array(z.string()),
  }),
  z.object({
    action: z.literal("edit_items"),
    listIds: z.array(z.string()).describe("Empty: search all active items"),
    items: z.array(
      z.object({
        oldTitle: z.string(),
        newTitle: z.string().nullable(),
        newContent: z.string().nullable(),
        newTags: Tags.nullable(),
        newEffort: Effort.nullable(),
      })
    ),
  }),
]);
export type RefactorAction = z.infer<typeof RefactorAction>;
export const RefactorPlan = z.object({ actions: z.array(RefactorAction) });
export type RefactorPlan = z.infer<typeof RefactorPlan>;

const ACTIONS_REFERENCE = loadPrompt("refactor-actions.txt");

function listsContext(): string {
  const allLists = db.select().from(lists).all();
  const active = db.select().from(todos).where(eq(todos.status, "active")).all();
  return allLists
    .map((list) => {
      const items = active.filter((t) => t.listId === list.id);
      return `List: "${list.name}" (ID: ${list.id})
  Summary: ${list.summary || "No summary"}
  Tags: [${list.tags?.length ? list.tags.join(", ") : "none"}]
  Type: ${list.isTimeBound ? "time-bound" : "timeless"}
  Items (${items.length}):
${items.map((t) => `    - "${t.title}"`).join("\n") || "    (empty)"}`;
    })
    .join("\n\n");
}

export function refactorPrompt(file: "refactor-chat.txt" | "refactor-extract.txt"): string {
  return loadPrompt(file)
    .replace("{TODAY}", localDateISO())
    .replace("{LISTS_CONTEXT}", listsContext())
    .replace("{ACTIONS}", ACTIONS_REFERENCE);
}

const byTitle = (titles: string[]) => {
  const wanted = new Set(titles.map((t) => t.toLowerCase()));
  return (item: { title: string }) => wanted.has(item.title.toLowerCase());
};

function getList(id: string) {
  const list = db.select().from(lists).where(eq(lists.id, id)).get();
  if (!list) throw new Error(`No list with ID ${id}`);
  return list;
}

function createList(fields: Omit<NewList, "id" | "createdAt" | "itemCount">) {
  const list = { ...fields, id: uuid(), createdAt: new Date(), itemCount: 0 };
  db.insert(lists).values(list).run();
  return list;
}

// Returns a one-line description of what changed. Throws on invalid input;
// callers run it in a transaction so a failure leaves nothing half-done.
export function applyRefactorAction(a: RefactorAction): string {
  switch (a.action) {
    case "edit": {
      const list = getList(a.listId);
      const updates: Partial<NewList> = {};
      if (a.newName) updates.name = a.newName;
      if (a.newSummary) updates.summary = a.newSummary;
      if (a.newTags) updates.tags = a.newTags;
      if (Object.keys(updates).length === 0) return `"${list.name}": nothing to change`;
      db.update(lists).set(updates).where(eq(lists.id, list.id)).run();
      const parts = [
        a.newName && `renamed to "${a.newName}"`,
        a.newSummary && "summary updated",
        a.newTags && `tags → [${a.newTags.join(", ")}]`,
      ].filter(Boolean);
      return `"${list.name}": ${parts.join(", ")}`;
    }

    case "merge": {
      if (a.listIds.length < 2) throw new Error("Merge needs at least 2 lists");
      const sources = a.listIds.map(getList);
      const merged = createList({
        name: a.newName,
        summary: a.newSummary,
        tags: a.newTags ?? [...new Set(sources.flatMap((l) => l.tags ?? []))],
        isTimeBound: sources.some((l) => l.isTimeBound),
      });
      db.update(todos).set({ listId: merged.id }).where(inArray(todos.listId, a.listIds)).run();
      db.delete(lists).where(inArray(lists.id, a.listIds)).run();
      return `Merged ${sources.map((l) => `"${l.name}"`).join(", ")} into "${merged.name}"`;
    }

    case "split": {
      const source = getList(a.listId);
      const items = db.select().from(todos).where(eq(todos.listId, source.id)).all();
      const parts = a.splits.map((s) => {
        const target = createList({
          name: s.newName,
          summary: s.newSummary,
          tags: s.newTags ?? source.tags ?? [],
          isTimeBound: s.isTimeBound ?? source.isTimeBound,
        });
        const ids = items.filter(byTitle(s.itemTitles)).map((t) => t.id);
        if (ids.length) db.update(todos).set({ listId: target.id }).where(inArray(todos.id, ids)).run();
        return `"${target.name}" (${ids.length} items)`;
      });
      const left = db.select({ id: todos.id }).from(todos).where(eq(todos.listId, source.id)).all();
      if (left.length === 0) db.delete(lists).where(eq(lists.id, source.id)).run();
      return `Split "${source.name}" into ${parts.join(", ")}`;
    }

    case "move": {
      const source = getList(a.listId);
      const target = getList(a.targetListId);
      const items = db.select().from(todos).where(eq(todos.listId, source.id)).all();
      const ids = (a.itemTitles.length ? items.filter(byTitle(a.itemTitles)) : items).map((t) => t.id);
      if (ids.length) db.update(todos).set({ listId: target.id }).where(inArray(todos.id, ids)).run();
      return `Moved ${ids.length} item(s) from "${source.name}" to "${target.name}"`;
    }

    case "delete": {
      const doomed = a.listIds.map(getList);
      const removed = db.delete(todos).where(inArray(todos.listId, a.listIds)).returning({ id: todos.id }).all();
      db.delete(lists).where(inArray(lists.id, a.listIds)).run();
      const items = removed.length ? ` (${removed.length} items)` : "";
      return `Deleted ${doomed.map((l) => `"${l.name}"`).join(", ")}${items}`;
    }

    case "edit_items": {
      const scope = db
        .select()
        .from(todos)
        .where(a.listIds.length ? inArray(todos.listId, a.listIds) : eq(todos.status, "active"))
        .all();
      const renamed: string[] = [];
      let edited = 0;
      for (const e of a.items) {
        const match = scope.find(byTitle([e.oldTitle]));
        if (!match) continue;
        const updates: Partial<NewTodo> = {};
        if (e.newTitle) updates.title = e.newTitle;
        if (e.newContent !== null) updates.content = e.newContent || null;
        if (e.newTags) updates.tags = e.newTags;
        if (e.newEffort) updates.effort = e.newEffort;
        if (Object.keys(updates).length === 0) continue;
        db.update(todos).set(updates).where(eq(todos.id, match.id)).run();
        edited++;
        if (e.newTitle && e.newTitle !== match.title) renamed.push(`"${match.title}" → "${e.newTitle}"`);
      }
      const missed = a.items.length - edited;
      return `Edited ${edited} item(s)${renamed.length ? `: ${renamed.join("; ")}` : ""}${missed ? ` (${missed} not found or unchanged)` : ""}`;
    }
  }
}
