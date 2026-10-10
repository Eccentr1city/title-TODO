import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { structured } from "@/lib/anthropic";
import { loadPrompt } from "@/lib/prompts";
import { promptNow } from "@/lib/dates";
import { listsAndTodosContext } from "@/lib/llm-context";
import { importTodos, ListSpec, TodoSpec } from "@/lib/todo-import";

const Categories = z.object({ categories: z.array(z.string()) });
const CategoryTodos = ListSpec.extend({
  todos: z.array(TodoSpec.extend({ sourceRef: z.string().nullable() })),
});

// Turns the agreed plan into todos: first split it into categories, then
// generate each category's list and items in parallel.
export async function POST(request: NextRequest) {
  const { plan } = (await request.json()) as { plan: string };
  if (!plan || typeof plan !== "string") {
    return NextResponse.json({ error: "plan is required" }, { status: 400 });
  }

  const { lists: existingLists, listsContext, todosContext } = listsAndTodosContext();

  let categories: string[];
  try {
    ({ categories } = await structured(Categories, [{ role: "user", content: plan }], {
      model: "medium",
      system: loadPrompt("obsidian-apply-categories.txt"),
      maxTokens: 4096,
      effort: "low",
    }));
  } catch (err) {
    console.error("Category extraction failed:", err);
    categories = ["General"];
  }

  const prompt = loadPrompt("obsidian-apply-generate.txt").replace("{DATETIME}", promptNow());
  const results = await Promise.all(
    categories.map(async (category) => {
      try {
        const data = await structured(
          CategoryTodos,
          [
            {
              role: "user",
              content: `Existing lists:\n${listsContext}\n\nExisting TODOs (avoid duplicates):\n${todosContext}\n\nThe agreed plan from the conversation:\n${plan}\n\nGenerate the TODOs for this specific category: "${category}"\n\nOnly include items that belong to this category.`,
            },
          ],
          { model: "medium", system: prompt, maxTokens: 16000, effort: "medium" }
        );
        return { category, data, error: null };
      } catch (err) {
        return { category, data: null, error: err instanceof Error ? err.message : String(err) };
      }
    })
  );

  const errors = results.filter((r) => r.error).map((r) => `${r.category}: ${r.error}`);
  const imported = importTodos(
    results.flatMap((r) => (r.data ? [{ list: r.data, items: r.data.todos }] : [])),
    { source: "obsidian", skipDuplicates: true }
  );
  const listName = new Map(
    [...existingLists, ...imported.createdLists].map((l) => [l.id, l.name])
  );

  return NextResponse.json({
    success: true,
    createdLists: imported.createdLists.map((l) => l.name),
    createdTodos: imported.createdTodos.map((t) => ({ list: listName.get(t.listId) ?? "?", title: t.title })),
    errors: [...errors, ...imported.errors],
    categoryResults: results.map((r) => ({ category: r.category, success: !r.error, error: r.error })),
  });
}
