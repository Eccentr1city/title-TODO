import { z } from "zod";
import { MODELS, structured, type ModelTier } from "./anthropic";
import { loadPrompt } from "./prompts";
import { promptNow } from "./dates";
import { v4 as uuid } from "uuid";
import { db } from "@/db";
import { lists, todos, type List, type Todo } from "@/db/schema";

// Magic input: free text in, TODOs filed into lists out. Used by the app's
// input box and by /api/quick-add (iOS Shortcuts).

// The shape the model fills in, enforced by structured outputs. Descriptions
// are sent with the schema.

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
    .describe("ISO 8601 local time with UTC offset, e.g. 2026-10-12T10:00:00-07:00"),
  reminderCadence: z.string().nullable().describe("daily / weekly / monthly, or null"),
  tags: z.array(z.string()),
  effort: z.enum(["quick", "medium", "deep"]).nullable(),
});

export type ListSpec = z.infer<typeof ListSpec>;
export type TodoSpec = z.infer<typeof TodoSpec>;

function parseReminder(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Files each item into its list — found by name (case-insensitive) or created
// — in one transaction, so a failure leaves nothing half-added.
function importTodos(
  items: (TodoSpec & ListSpec)[],
  source: Todo["source"]
): { createdLists: List[]; createdTodos: Todo[] } {
  return db.transaction((tx) => {
    const knownLists = tx.select().from(lists).all();
    const createdLists: List[] = [];
    const createdTodos: Todo[] = [];

    for (const item of items) {
      const title = item.title.trim();
      const name = item.listName.trim();
      if (!title || !name) continue;

      let list = knownLists.find((l) => l.name.toLowerCase() === name.toLowerCase());
      if (!list) {
        list = {
          id: uuid(),
          name,
          summary: item.listSummary || `Items related to ${name}`,
          tags: item.listTags,
          isTimeBound: item.listIsTimeBound,
          createdAt: new Date(),
          itemCount: 0,
        };
        tx.insert(lists).values(list).run();
        knownLists.push(list);
        createdLists.push(list);
      }

      const todo: Todo = {
        id: uuid(),
        title,
        content: item.content || null,
        listId: list.id,
        createdAt: new Date(),
        nextReminder: parseReminder(item.nextReminder),
        notifiedReminder: null,
        reminderCadence: item.reminderCadence || null,
        status: "active",
        completedAt: null,
        archivedAt: null,
        source,
        sourceRef: null,
        tags: item.tags,
        effort: item.effort,
        manualPriority: 0,
      };
      tx.insert(todos).values(todo).run();
      createdTodos.push(todo);
    }
    return { createdLists, createdTodos };
  });
}

const MagicOutput = z.object({ todos: z.array(TodoSpec.extend(ListSpec.shape)) });

function context(): string {
  const existing = db.select().from(lists).all();
  if (existing.length === 0) return "\n\nNo existing lists yet. Create appropriate ones.";

  const listLines = existing.map((l) => {
    const tags = l.tags?.length ? ` [tags: ${l.tags.join(", ")}]` : "";
    return `- "${l.name}": ${l.summary || "No description"} ${l.isTimeBound ? "(time-bound)" : "(timeless)"}${tags}`;
  });

  // Existing tags by usage, so the model reuses them
  const tagCounts = new Map<string, number>();
  for (const t of db.select({ tags: todos.tags }).from(todos).all()) {
    for (const tag of t.tags || []) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
  }
  const tagLines = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => `- "${tag}" (used ${count}x)`);

  return (
    `\n\nExisting lists:\n${listLines.join("\n")}` +
    (tagLines.length ? `\n\nExisting tags (reuse when appropriate):\n${tagLines.join("\n")}` : "")
  );
}

export function isModelTier(value: unknown): value is ModelTier {
  return typeof value === "string" && value in MODELS;
}

export async function addFromText(input: string, model: ModelTier = "cheap") {
  const output = await structured(MagicOutput, [{ role: "user", content: input + context() }], {
    model,
    system: loadPrompt("magic.txt").replace("{DATETIME}", promptNow()),
    maxTokens: 8192,
    effort: "medium",
  });
  return importTodos(output.todos, "magic_input");
}
