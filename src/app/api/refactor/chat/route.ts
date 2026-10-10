import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { streamChatResponse } from "@/lib/chat-stream";
import { db } from "@/db";
import { lists, todos } from "@/db/schema";
import { eq } from "drizzle-orm";
import { loadPrompt } from "@/lib/prompts";
import { localDateISO } from "@/lib/dates";

function getListsContext() {
  const allLists = db.select().from(lists).all();
  const activeTodos = db.select().from(todos).where(eq(todos.status, "active")).all();

  const listsWithItems = allLists.map((list) => {
    const items = activeTodos.filter((t) => t.listId === list.id);
    const itemLines = items.map((t) => `    - "${t.title}"`).join("\n");
    return `List: "${list.name}" (ID: ${list.id})
  Summary: ${list.summary || "No summary"}
  Tags: [${list.tags?.length ? list.tags.join(", ") : "none"}]
  Type: ${list.isTimeBound ? "time-bound" : "timeless"}
  Items (${items.length} total):
${itemLines || "    (empty)"}`;
  });

  return listsWithItems.join("\n\n");
}

export async function POST(request: NextRequest) {
  const { messages } = (await request.json()) as { messages: Anthropic.MessageParam[] };
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages is required" }, { status: 400 });
  }

  const today = localDateISO();
  const listsContext = getListsContext();

  const prompt = loadPrompt("refactor-chat.txt")
    .replace("{TODAY}", today)
    .replace("{LISTS_CONTEXT}", listsContext);

  return streamChatResponse({
    model: "medium",
    system: prompt,
    messages,
    maxTokens: 64000,
    effort: "medium",
  });
}
