import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lists, todos } from "@/db/schema";
import { chat } from "@/lib/anthropic";
import { eq } from "drizzle-orm";
import { loadPrompt } from "@/lib/prompts";

export async function POST(request: NextRequest) {
  const { listId, question } = await request.json();

  if (!listId || !question) {
    return NextResponse.json(
      { error: "listId and question are required" },
      { status: 400 }
    );
  }

  // Get list info
  const [list] = await db.select().from(lists).where(eq(lists.id, listId)).limit(1);

  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  // Get all todos in this list
  const listTodos = await db
    .select()
    .from(todos)
    .where(eq(todos.listId, listId))
    .all();

  const activeTodos = listTodos.filter((t) => t.status === "active");
  const completedTodos = listTodos.filter((t) => t.status === "completed");

  const todosContext = activeTodos
    .map((t, i) => {
      let line = `${i + 1}. ${t.title}`;
      if (t.content) line += ` - ${t.content}`;
      if (t.tags && t.tags.length > 0) line += ` [${t.tags.join(", ")}]`;
      return line;
    })
    .join("\n");

  const context = `List: "${list.name}"
Description: ${list.summary || "No description"}
Type: ${list.isTimeBound ? "Time-bound (has deadlines)" : "Timeless (no deadlines)"}

Active items (${activeTodos.length}):
${todosContext || "No items yet"}

${completedTodos.length > 0 ? `\nCompleted items: ${completedTodos.length}` : ""}`;

  const datetime = new Date().toLocaleString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
  const systemPrompt = loadPrompt("ask.txt").replace("{DATETIME}", datetime);

  try {
    const response = await chat(
      [
        { role: "user", content: `${context}\n\nUser question: ${question}` },
      ],
      {
        model: "medium",
        system: systemPrompt,
        maxTokens: 4096,
        effort: "low",
      }
    );

    return NextResponse.json({ response });
  } catch (error) {
    console.error("Ask error:", error);
    return NextResponse.json(
      { error: "Failed to get response" },
      { status: 500 }
    );
  }
}


