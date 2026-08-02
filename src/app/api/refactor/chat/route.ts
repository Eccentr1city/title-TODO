import { NextRequest, NextResponse } from "next/server";
import { anthropic, MODELS } from "@/lib/anthropic";
import { db } from "@/db";
import { lists, todos } from "@/db/schema";
import { eq } from "drizzle-orm";
import { loadPrompt } from "@/lib/prompts";

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
  Items (${list.itemCount} total):
${itemLines || "    (empty)"}`;
  });

  return listsWithItems.join("\n\n");
}


export async function POST(request: NextRequest) {
  const body = await request.json();
  const { messages } = body as {
    messages: { role: "user" | "assistant"; content: string }[];
  };

  const today = new Date().toISOString().split("T")[0];
  const listsContext = getListsContext();

  const prompt = loadPrompt("refactor-chat.txt")
    .replace("{TODAY}", today)
    .replace("{LISTS_CONTEXT}", listsContext);

  try {
    const response = await anthropic.messages.create({
      model: MODELS.medium,
      max_tokens: 16000,
      output_config: { effort: "medium" },
      system: prompt,
      messages,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const text = textBlock?.type === "text" ? textBlock.text : "";

    return NextResponse.json({
      response: text,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    });
  } catch (error) {
    console.error("Refactor chat error:", error);
    return NextResponse.json(
      { error: "Failed to get response" },
      { status: 500 }
    );
  }
}
