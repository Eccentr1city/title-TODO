import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { lists, todos } from "@/db/schema";
import { MODELS, structured, type ModelTier } from "@/lib/anthropic";
import { loadPrompt } from "@/lib/prompts";
import { promptNow } from "@/lib/dates";
import { listJSON, todoJSON } from "@/lib/serialize";
import { importTodos, ListSpec, TodoSpec } from "@/lib/todo-import";

const MagicOutput = z.object({ todos: z.array(TodoSpec.extend(ListSpec.shape)) });

export async function POST(request: NextRequest) {
  const { input, model } = await request.json();

  if (!input || typeof input !== "string") {
    return NextResponse.json({ error: "Input is required" }, { status: 400 });
  }
  const tier: ModelTier = typeof model === "string" && model in MODELS ? (model as ModelTier) : "cheap";

  const systemPrompt = loadPrompt("magic.txt").replace("{DATETIME}", promptNow());

  const existingLists = db.select().from(lists).all();
  const listsContext = existingLists
    .map((l) => {
      const tags = l.tags?.length ? ` [tags: ${l.tags.join(", ")}]` : "";
      return `- "${l.name}": ${l.summary || "No description"} ${l.isTimeBound ? "(time-bound)" : "(timeless)"}${tags}`;
    })
    .join("\n");

  // Existing tags by usage, so the model reuses them
  const tagCounts = new Map<string, number>();
  for (const t of db.select({ tags: todos.tags }).from(todos).all()) {
    for (const tag of t.tags || []) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
  }
  const tagsContext =
    tagCounts.size > 0
      ? `\n\nExisting tags (reuse when appropriate):\n${[...tagCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([tag, count]) => `- "${tag}" (used ${count}x)`)
          .join("\n")}`
      : "";

  const contextMessage =
    (existingLists.length > 0
      ? `\n\nExisting lists:\n${listsContext}`
      : "\n\nNo existing lists yet. Create appropriate ones.") + tagsContext;

  try {
    const output = await structured(MagicOutput, [{ role: "user", content: input + contextMessage }], {
      model: tier,
      system: systemPrompt,
      maxTokens: 8192,
      effort: "medium",
    });

    const { createdLists, createdTodos } = importTodos(
      output.todos.map((item) => ({ list: item, items: [item] })),
      { source: "magic_input" }
    );

    return NextResponse.json({
      todos: createdTodos.map(todoJSON),
      lists: createdLists.map((l) =>
        listJSON(l, createdTodos.filter((t) => t.listId === l.id).length)
      ),
    });
  } catch (error) {
    console.error("Magic input error:", error);
    return NextResponse.json({ error: "Failed to process input" }, { status: 500 });
  }
}
