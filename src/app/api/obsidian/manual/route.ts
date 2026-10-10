import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { streamChatResponse } from "@/lib/chat-stream";
import { loadPrompt } from "@/lib/prompts";
import { localDateISO } from "@/lib/dates";
import { obsidianUnavailable } from "@/lib/paths";
import { listsAndTodosContext } from "@/lib/llm-context";
import { readNoteForPrompt } from "@/lib/obsidian";

export async function POST(request: NextRequest) {
  const unavailable = obsidianUnavailable();
  if (unavailable) return unavailable;
  const { filePaths, messages } = (await request.json()) as {
    filePaths: string[];
    messages: Anthropic.MessageParam[];
  };
  if (!Array.isArray(filePaths) || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "filePaths and messages are required" }, { status: 400 });
  }

  const noteContents: string[] = [];
  const notFound: string[] = [];
  for (const relPath of filePaths) {
    const note = readNoteForPrompt(relPath);
    if (note === null) notFound.push(relPath);
    else noteContents.push(note);
  }

  if (noteContents.length === 0) {
    // Client reads plain text — keep this consistent with the stream format
    return new Response(
      `Could not find any of the specified files. Not found: ${notFound.join(", ")}`,
      { headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }

  const { listsContext, todosContext } = listsAndTodosContext();
  const systemPrompt = loadPrompt("obsidian-manual.txt")
    .replace("{TODAY}", localDateISO())
    .replace("{EXISTING_LISTS}", listsContext)
    .replace("{EXISTING_TODOS}", todosContext);

  // The notes go into the first message only
  const messagesForApi =
    messages.length === 1 && messages[0].role === "user"
      ? [
          {
            role: "user" as const,
            content: `Here are the specific Obsidian notes to process:\n\n${noteContents.join("\n")}\n\n${messages[0].content}`,
          },
        ]
      : messages;

  return streamChatResponse({
    model: "medium",
    system: systemPrompt,
    messages: messagesForApi,
    maxTokens: 64000,
    effort: "medium",
    prefix: notFound.length > 0 ? `[Could not find: ${notFound.join(", ")}]\n\n` : undefined,
  });
}
