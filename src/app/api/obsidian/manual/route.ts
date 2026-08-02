import { NextRequest, NextResponse } from "next/server";
import { anthropic, MODELS } from "@/lib/anthropic";
import { db } from "@/db";
import { lists, todos } from "@/db/schema";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { loadPrompt } from "@/lib/prompts";

const NOTES_DIR = "/Users/adamkaufman/Documents/Adam's Notes";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { filePaths, messages } = body as {
    filePaths: string[];
    messages: { role: "user" | "assistant"; content: string }[];
  };

  // Read the specified files
  const noteContents: string[] = [];
  const notFound: string[] = [];

  for (const relPath of filePaths) {
    const fullPath = path.join(NOTES_DIR, relPath);
    if (!fs.existsSync(fullPath)) {
      notFound.push(relPath);
      continue;
    }
    const content = fs.readFileSync(fullPath, "utf-8");
    const stat = fs.statSync(fullPath);
    const mtime = stat.mtime.toISOString().split("T")[0];
    noteContents.push(`=== ${relPath} (last modified: ${mtime}) ===\n${content}\n`);
  }

  if (noteContents.length === 0) {
    return NextResponse.json({
      response: `Could not find any of the specified files. Not found: ${notFound.join(", ")}`,
      notFound,
    });
  }

  // Get existing context
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

  const today = new Date().toISOString().split("T")[0];

  const systemPrompt = loadPrompt("obsidian-manual.txt")
    .replace("{TODAY}", today)
    .replace("{EXISTING_LISTS}", listsContext)
    .replace("{EXISTING_TODOS}", todosContext);

  // Inject note contents on first message
  const isFirstMessage = messages.length === 1 && messages[0].role === "user";
  let messagesForApi = [...messages];

  if (isFirstMessage) {
    messagesForApi = [
      {
        role: "user" as const,
        content: `Here are the specific Obsidian notes to process:\n\n${noteContents.join("\n")}\n\n${messages[0].content}`,
      },
    ];
  }

  try {
    const response = await anthropic.messages.create({
      model: MODELS.medium,
      max_tokens: 16000,
      output_config: { effort: "medium" },
      system: systemPrompt,
      messages: messagesForApi,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const text = textBlock?.type === "text" ? textBlock.text : "";

    return NextResponse.json({
      response: text,
      notFound,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    });
  } catch (error) {
    console.error("Manual obsidian error:", error);
    return NextResponse.json(
      { error: "Failed to get response" },
      { status: 500 }
    );
  }
}
