import { NextRequest, NextResponse } from "next/server";
import { anthropic, MODELS } from "@/lib/anthropic";
import { db } from "@/db";
import { lists, todos } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";

const GENERATE_PROMPT = `You are generating structured TODO items for a personal TODO app. Today's date is {TODAY}.

You will be given:
1. A plan that was agreed upon with the user (which items to create, in which categories)
2. The existing lists in the app

Your job is to output ONLY valid JSON (no markdown, no code fences) with the exact TODOs to create for the specified category.

Rules:
- Use an existing list if one matches. Only create a new list if the plan explicitly says to.
- Set source to "obsidian" for all items
- For wishlists/timeless items: no reminders, set effort to null
- For actionable tasks: set reasonable effort estimates and optional reminders
- Be concise in titles. Put details in content field.

Output format (raw JSON only):
{
  "listName": "exact list name",
  "listIsNew": false,
  "listSummary": "only if listIsNew is true",
  "listTags": ["tag"],
  "listIsTimeBound": true,
  "todos": [
    {
      "title": "concise title",
      "content": "optional details/notes",
      "tags": [],
      "effort": "quick/medium/deep or null",
      "nextReminder": "ISO date or null",
      "reminderCadence": "daily/weekly/monthly or null",
      "sourceRef": "filename.md"
    }
  ]
}`;

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
    max_tokens: 2048,
    system: `Extract the list of categories/lists from this TODO plan. Output ONLY a JSON array of category names, no markdown. Example: ["Books to Read", "Shopping", "Home Improvement"]`,
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
  const prompt = GENERATE_PROMPT
    .replace("{TODAY}", today);

  const results = await Promise.all(
    categories.map(async (category) => {
      try {
        const response = await anthropic.messages.create({
          model: MODELS.medium,
          max_tokens: 4096,
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
