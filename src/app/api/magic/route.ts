import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lists, todos } from "@/db/schema";
import { chat } from "@/lib/anthropic";
import { eq, sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { loadPrompt } from "@/lib/prompts";

export async function POST(request: NextRequest) {
  const { input, model = "cheap" } = await request.json();

  if (!input || typeof input !== "string") {
    return NextResponse.json({ error: "Input is required" }, { status: 400 });
  }

  // Validate model
  const validModels = ["cheap", "medium", "expensive"];
  const selectedModel = validModels.includes(model) ? model : "cheap";

  const now = new Date();
  const datetime = now.toLocaleString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
  const systemPrompt = loadPrompt("magic.txt").replace("{DATETIME}", datetime);

  // Get existing lists for context
  const existingLists = await db.select().from(lists).all();
  const listsContext = existingLists
    .map((l) => {
      const tags = (l.tags as string[])?.length > 0 ? ` [tags: ${(l.tags as string[]).join(", ")}]` : "";
      return `- "${l.name}": ${l.summary || "No description"} ${l.isTimeBound ? "(time-bound)" : "(timeless)"}${tags}`;
    })
    .join("\n");

  // Collect all distinct tags used across existing todos
  const existingTodos = await db.select({ tags: todos.tags }).from(todos).all();
  const tagCounts = new Map<string, number>();
  for (const t of existingTodos) {
    for (const tag of (t.tags as string[]) || []) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }
  const tagsContext = tagCounts.size > 0
    ? `\n\nExisting tags (reuse when appropriate):\n${[...tagCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([tag, count]) => `- "${tag}" (used ${count}x)`)
        .join("\n")}`
    : "";

  const contextMessage = (existingLists.length > 0
    ? `\n\nExisting lists:\n${listsContext}`
    : "\n\nNo existing lists yet. Create appropriate ones.") + tagsContext;

  try {
    const response = await chat(
      [{ role: "user", content: input + contextMessage }],
      { 
        model: selectedModel as "cheap" | "medium" | "expensive", 
        system: systemPrompt,
        maxTokens: 4096,
      }
    );

    // Parse the response
    let parsed;
    try {
      // Try to extract JSON if wrapped in code blocks
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, response];
      parsed = JSON.parse(jsonMatch[1] || response);
    } catch {
      console.error("Failed to parse LLM response:", response);
      return NextResponse.json({ error: "Failed to parse response" }, { status: 500 });
    }

    const createdTodos = [];
    const createdLists = [];

    for (const item of parsed.todos) {
      // Find or create list
      let list = existingLists.find(
        (l) => l.name.toLowerCase() === item.listName.toLowerCase()
      );

      if (!list && item.listIsNew !== false) {
        // Create new list
        const newList = {
          id: uuid(),
          name: item.listName,
          summary: item.listSummary || `Items related to ${item.listName}`,
          tags: item.listTags || [],
          isTimeBound: item.listIsTimeBound ?? true,
          createdAt: new Date(),
          itemCount: 0,
        };
        await db.insert(lists).values(newList);
        list = newList;
        createdLists.push({
          ...newList,
          createdAt: newList.createdAt.toISOString(),
        });
        existingLists.push(newList); // Add to local cache for subsequent items
      }

      if (!list) {
        // Fallback: create with the specified name
        const newList = {
          id: uuid(),
          name: item.listName,
          summary: item.listSummary || `Items related to ${item.listName}`,
          tags: item.listTags || [],
          isTimeBound: item.listIsTimeBound ?? true,
          createdAt: new Date(),
          itemCount: 0,
        };
        await db.insert(lists).values(newList);
        list = newList;
        createdLists.push({
          ...newList,
          createdAt: newList.createdAt.toISOString(),
        });
        existingLists.push(newList);
      }

      // Create todo
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
        source: "magic_input" as const,
        sourceRef: null,
        tags: item.tags || [],
        effort: item.effort || null,
      };

      await db.insert(todos).values(newTodo);

      // Update list item count
      await db
        .update(lists)
        .set({ itemCount: sql`${lists.itemCount} + 1` })
        .where(eq(lists.id, list.id));

      createdTodos.push({
        ...newTodo,
        createdAt: newTodo.createdAt.toISOString(),
        nextReminder: newTodo.nextReminder?.toISOString() || null,
        completedAt: null,
      });
    }

    return NextResponse.json({
      todos: createdTodos,
      lists: createdLists,
    });
  } catch (error) {
    console.error("Magic input error:", error);
    return NextResponse.json(
      { error: "Failed to process input" },
      { status: 500 }
    );
  }
}

