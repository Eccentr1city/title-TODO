import { NextRequest, NextResponse } from "next/server";
import { anthropic, MODELS } from "@/lib/anthropic";
import { db } from "@/db";
import { lists, todos } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { loadPrompt } from "@/lib/prompts";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { plan, conversationHistory } = body as {
    plan: string;
    conversationHistory: { role: "user" | "assistant"; content: string }[];
  };

  const today = new Date().toISOString().split("T")[0];
  const existingLists = db.select().from(lists).all();
  const existingTodos = db.select().from(todos).where(eq(todos.status, "active")).all();

  const listsContext = existingLists
    .map((l) => `- "${l.name}" (${l.isTimeBound ? "time-bound" : "timeless"}): ${l.summary || ""} [${l.itemCount} items]`)
    .join("\n") || "(none)";

  const todosContext = existingTodos
    .map((t) => {
      const list = existingLists.find((l) => l.id === t.listId);
      return `- [${list?.name || "?"}] ${t.title}`;
    })
    .join("\n") || "(none)";

  // Extract categories from the plan by asking Sonnet to list them
  const categoryResponse = await anthropic.messages.create({
    model: MODELS.medium,
    max_tokens: 4096,
    system: loadPrompt("obsidian-apply-categories.txt"),
    messages: [{ role: "user", content: plan }],
  });

  const catText = categoryResponse.content.find((b) => b.type === "text");
  const catRaw = catText?.type === "text" ? catText.text : "[]";
  let categories: string[];
  try {
    const cleaned = catRaw.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
    categories = JSON.parse(cleaned);
  } catch {
    categories = ["General"];
  }

  // Generate TODOs for each category in parallel
  const prompt = loadPrompt("obsidian-apply-generate.txt")
    .replace("{TODAY}", today);

  const results = await Promise.all(
    categories.map(async (category) => {
      try {
        const response = await anthropic.messages.create({
          model: MODELS.medium,
          max_tokens: 8192,
          system: prompt,
          messages: [
            {
              role: "user",
              content: `Existing lists:\n${listsContext}\n\nExisting TODOs (avoid duplicates):\n${todosContext}\n\nThe agreed plan from the conversation:\n${plan}\n\nGenerate the TODOs for this specific category: "${category}"\n\nOnly include items that belong to this category.`,
            },
          ],
        });

        const textBlock = response.content.find((b) => b.type === "text");
        const raw = textBlock?.type === "text" ? textBlock.text : "";

        let jsonStr = raw;
        const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenceMatch) jsonStr = fenceMatch[1];

        const parsed = JSON.parse(jsonStr.trim());
        return { category, data: parsed, raw, error: null };
      } catch (err) {
        return { category, data: null, raw: "", error: String(err) };
      }
    })
  );

  // Insert into database
  const createdTodos: { list: string; title: string }[] = [];
  const createdLists: string[] = [];
  const errors: string[] = [];

  for (const result of results) {
    if (result.error || !result.data) {
      errors.push(`${result.category}: ${result.error || "no data"}`);
      continue;
    }

    const data = result.data;

    // Find or create list
    let list = existingLists.find(
      (l) => l.name.toLowerCase() === data.listName.toLowerCase()
    );

    if (!list && data.listIsNew !== false) {
      const newList = {
        id: uuid(),
        name: data.listName,
        summary: data.listSummary || `Items related to ${data.listName}`,
        tags: data.listTags || [],
        isTimeBound: data.listIsTimeBound ?? true,
        createdAt: new Date(),
        itemCount: 0,
      };
      db.insert(lists).values(newList).run();
      list = newList;
      createdLists.push(newList.name);
      existingLists.push(newList); // update local cache
    }

    if (!list) {
      // Fallback: create it anyway
      const newList = {
        id: uuid(),
        name: data.listName,
        summary: data.listSummary || `Items related to ${data.listName}`,
        tags: data.listTags || [],
        isTimeBound: data.listIsTimeBound ?? true,
        createdAt: new Date(),
        itemCount: 0,
      };
      db.insert(lists).values(newList).run();
      list = newList;
      createdLists.push(newList.name);
      existingLists.push(newList);
    }

    // Create todos
    for (const item of data.todos || []) {
      // Check for duplicate titles in same list
      const isDuplicate = existingTodos.some(
        (t) =>
          t.listId === list!.id &&
          t.title.toLowerCase() === item.title.toLowerCase()
      );
      if (isDuplicate) continue;

      const newTodo = {
        id: uuid(),
        title: item.title,
        content: item.content || null,
        listId: list.id,
        createdAt: new Date(),
        nextReminder: item.nextReminder ? new Date(item.nextReminder) : null,
        reminderCadence: item.reminderCadence || null,
        status: "active" as const,
        completedAt: null,
        source: "obsidian" as const,
        sourceRef: item.sourceRef || null,
        tags: item.tags || [],
        effort: item.effort || null,
      };

      db.insert(todos).values(newTodo).run();
      db.update(lists)
        .set({ itemCount: sql`${lists.itemCount} + 1` })
        .where(eq(lists.id, list.id))
        .run();

      createdTodos.push({ list: list.name, title: item.title });
    }
  }

  return NextResponse.json({
    success: true,
    createdLists,
    createdTodos,
    errors,
    categoryResults: results.map((r) => ({
      category: r.category,
      success: !r.error,
      error: r.error,
      raw: r.raw,
    })),
  });
}
