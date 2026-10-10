import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { streamChatResponse } from "@/lib/chat-stream";
import { loadPrompt } from "@/lib/prompts";
import { localDateISO } from "@/lib/dates";
import { obsidianUnavailable } from "@/lib/paths";
import { listsAndTodosContext } from "@/lib/llm-context";
import { loadSyncState, readNoteForPrompt } from "@/lib/obsidian";

type Filter = "personal" | "work" | "both";

const DEFAULT_PLAN_PROMPT = loadPrompt("obsidian-plan.txt");

function fillPrompt(template: string) {
  const ctx = listsAndTodosContext();
  return {
    ctx,
    prompt: template
      .replace("{TODAY}", localDateISO())
      .replace("{EXISTING_LISTS}", ctx.listsContext)
      .replace("{EXISTING_TODOS}", ctx.todosContext),
  };
}

function notesContext(filter: Filter): string {
  return Object.entries(loadSyncState().processedFiles)
    .filter(([, v]) =>
      filter === "personal" ? v.has_personal : filter === "work" ? v.has_work : v.has_personal || v.has_work
    )
    .map(([relPath]) => readNoteForPrompt(relPath))
    .filter((n): n is string => n !== null)
    .join("\n");
}

// POST: send a message in the planning conversation
export async function POST(request: NextRequest) {
  const unavailable = obsidianUnavailable();
  if (unavailable) return unavailable;
  const { messages, systemPrompt, filter = "personal" } = (await request.json()) as {
    messages: Anthropic.MessageParam[];
    systemPrompt?: string;
    filter?: Filter;
  };
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages is required" }, { status: 400 });
  }

  const { prompt } = fillPrompt(systemPrompt || DEFAULT_PLAN_PROMPT);

  // The notes go into the first message only
  const messagesForApi =
    messages.length === 1 && messages[0].role === "user"
      ? [
          {
            role: "user" as const,
            content: `Here are my Obsidian notes that contain personal TODOs:\n\n${notesContext(filter)}\n\n${messages[0].content}`,
          },
        ]
      : messages;

  // Obsidian imports are rare and can be gigantic — streaming means no HTTP
  // timeout ceiling, so give the model a very large output budget.
  return streamChatResponse({
    model: "medium",
    system: prompt,
    messages: messagesForApi,
    maxTokens: 64000,
    effort: "medium",
  });
}

// GET: return the default prompt and notes summary
export async function GET() {
  const files = Object.values(loadSyncState().processedFiles);
  const { prompt, ctx } = fillPrompt(DEFAULT_PLAN_PROMPT);

  return NextResponse.json({
    defaultPrompt: prompt,
    personalNoteCount: files.filter((v) => v.has_personal).length,
    workNoteCount: files.filter((v) => v.has_work).length,
    existingListCount: ctx.lists.length,
    existingTodoCount: ctx.todos.length,
  });
}
