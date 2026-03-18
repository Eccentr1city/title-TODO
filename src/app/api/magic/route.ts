import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lists, todos } from "@/db/schema";
import { chat } from "@/lib/anthropic";
import { eq, sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";

const SYSTEM_PROMPT = `You are a TODO extraction assistant. Your job is to parse natural language input and extract structured TODO items.

Given user input, extract one or more TODO items. For each item, determine:
1. A clear, concise title
2. Any additional content/notes (optional)
3. Which list it belongs to (create new lists as needed)
4. When the user should be reminded (if mentioned or implied)
5. Effort level if apparent (quick = <15min, medium = 15min-1hr, deep = 1hr+)

You will be given existing lists with their summaries to help you categorize. Match to existing lists when appropriate, or create new ones.

IMPORTANT: Respond with ONLY valid JSON, no markdown formatting or code blocks. The response must be a raw JSON object.

Response format:
{
  "todos": [
    {
      "title": "Clear action item",
      "content": "Optional additional context",
      "listName": "List Name",
      "listIsNew": false,
      "listSummary": "Only if listIsNew is true - describe what goes in this list",
      "listTags": ["tag1"],
      "listIsTimeBound": true,
      "nextReminder": "2024-12-29T10:00:00Z or null",
      "reminderCadence": "daily/weekly/etc or null",
      "tags": ["optional", "tags"],
      "effort": "quick/medium/deep or null"
    }
  ]
}

Only add additional content/notes if the user explicitly includes too much information to fit in a short title. If the user only includes enough information to write a short title, don't add any additional content/notes.

Be aggressive about creating sensible lists. If someone mentions movies, create a Movies list. If they mention work tasks, create appropriate work lists. Use your judgment.

For timeless lists (movies to watch, books to read, ideas), set listIsTimeBound to false and don't set reminders.`;

export async function POST(request: NextRequest) {
  const { input, model = "cheap" } = await request.json();

  if (!input || typeof input !== "string") {
    return NextResponse.json({ error: "Input is required" }, { status: 400 });
  }

  // Validate model
  const validModels = ["cheap", "medium", "expensive"];
  const selectedModel = validModels.includes(model) ? model : "cheap";

  // Get existing lists for context
  const existingLists = await db.select().from(lists).all();
  const listsContext = existingLists
    .map((l) => `- "${l.name}": ${l.summary || "No description"} ${l.isTimeBound ? "(time-bound)" : "(timeless)"}`)
    .join("\n");

  const contextMessage = existingLists.length > 0
    ? `\n\nExisting lists:\n${listsContext}`
    : "\n\nNo existing lists yet. Create appropriate ones.";

  try {
    const response = await chat(
      [{ role: "user", content: input + contextMessage }],
      { 
        model: selectedModel as "cheap" | "medium" | "expensive", 
        system: SYSTEM_PROMPT,
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

