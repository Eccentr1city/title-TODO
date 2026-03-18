import { NextRequest, NextResponse } from "next/server";
import { anthropic, MODELS } from "@/lib/anthropic";
import { db } from "@/db";
import { lists, todos } from "@/db/schema";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";

const NOTES_DIR = "/Users/adamkaufman/Documents/Adam's Notes";
const ICLOUD_DIR = path.join(
  process.env.HOME || "",
  "Library/Mobile Documents/com~apple~CloudDocs/title-TODO"
);
const STATE_FILE = path.join(ICLOUD_DIR, "obsidian-sync-state.json");

function loadTriageState() {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  }
  return { processedFiles: {} };
}

function getExistingContext() {
  const existingLists = db.select().from(lists).all();
  const existingTodos = db
    .select()
    .from(todos)
    .where(eq(todos.status, "active"))
    .all();

  return { existingLists, existingTodos };
}

function buildNotesContext(filter: "personal" | "work" | "both"): string {
  const state = loadTriageState();
  const pf = state.processedFiles as Record<string, {
    mtimeMs: number;
    has_personal: boolean;
    has_work: boolean;
    personal_summary: string;
    work_summary: string;
  }>;

  const relevantFiles = Object.entries(pf).filter(([, v]) => {
    if (filter === "personal") return v.has_personal;
    if (filter === "work") return v.has_work;
    return v.has_personal || v.has_work;
  });

  const noteContents: string[] = [];

  for (const [relPath, meta] of relevantFiles) {
    const fullPath = path.join(NOTES_DIR, relPath);
    if (!fs.existsSync(fullPath)) continue;

    const content = fs.readFileSync(fullPath, "utf-8");
    const mtime = new Date(meta.mtimeMs);
    const mtimeStr = mtime.toISOString().split("T")[0];

    noteContents.push(
      `=== ${relPath} (last modified: ${mtimeStr}) ===\n${content}\n`
    );
  }

  return noteContents.join("\n");
}

const DEFAULT_PLAN_PROMPT = `You are helping organize personal TODO items extracted from Obsidian notes. Today's date is {TODAY}.

You will be given:
1. The contents of notes that were identified as containing personal (non-work) TODOs
2. The existing TODO lists and items already in the app

Your job:
1. Read through all the notes carefully
2. Identify which items are STILL RELEVANT as of today. Consider:
   - Items from notes last modified long ago are more likely to be outdated
   - Recurring needs (haircuts, cleaning) written months ago are almost certainly done
   - Wishlists (books, movies, shows) are likely still relevant even if old
   - One-time tasks (buy X, call Y) older than ~2 months are probably done unless they're major life tasks
   - Goals and aspirations may still be relevant even if old
3. For items you're unsure about, ASK the user
4. Group the still-relevant items into categories, PREFERRING existing lists over creating new ones
5. Flag any potential duplicates with existing TODOs

IMPORTANT: Be CONSERVATIVE about creating new lists. Only create a new list if items clearly don't fit any existing list. Prefer adding to existing lists.

Format your response as a clear proposal:
- List each proposed category (noting if it's an existing list or a new one)
- Under each category, list the specific TODO items you'd create
- Include a "Questions" section for anything you're unsure about
- Include a "Skipped" section briefly noting items you consider outdated and why

Existing lists in the app:
{EXISTING_LISTS}

Existing active TODOs (to avoid duplicates):
{EXISTING_TODOS}`;

// POST: send a message in the planning conversation
export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    messages,
    systemPrompt,
    filter = "personal",
  } = body as {
    messages: { role: "user" | "assistant"; content: string }[];
    systemPrompt?: string;
    filter?: "personal" | "work" | "both";
  };

  const { existingLists, existingTodos } = getExistingContext();

  const listsContext = existingLists.length > 0
    ? existingLists
        .map((l) => `- "${l.name}" (${l.isTimeBound ? "time-bound" : "timeless"}): ${l.summary || "no description"} [${l.itemCount} items]`)
        .join("\n")
    : "(No existing lists yet)";

  const todosContext = existingTodos.length > 0
    ? existingTodos
        .map((t) => {
          const list = existingLists.find((l) => l.id === t.listId);
          return `- [${list?.name || "?"}] ${t.title}`;
        })
        .join("\n")
    : "(No existing TODOs)";

  const today = new Date().toISOString().split("T")[0];

  const prompt = (systemPrompt || DEFAULT_PLAN_PROMPT)
    .replace("{TODAY}", today)
    .replace("{EXISTING_LISTS}", listsContext)
    .replace("{EXISTING_TODOS}", todosContext);

  // If this is the first message, inject the notes context
  const isFirstMessage = messages.length === 1 && messages[0].role === "user";
  let messagesForApi = [...messages];

  if (isFirstMessage) {
    const notesContext = buildNotesContext(filter);
    messagesForApi = [
      {
        role: "user" as const,
        content: `Here are my Obsidian notes that contain personal TODOs:\n\n${notesContext}\n\n${messages[0].content}`,
      },
    ];
  }

  try {
    const response = await anthropic.messages.create({
      model: MODELS.medium,
      max_tokens: 8192,
      system: prompt,
      messages: messagesForApi,
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
    console.error("Plan conversation error:", error);
    return NextResponse.json(
      { error: "Failed to get response" },
      { status: 500 }
    );
  }
}

// GET: return the default prompt and notes summary
export async function GET() {
  const state = loadTriageState();
  const pf = state.processedFiles as Record<string, { has_personal: boolean; has_work: boolean }>;

  const personalCount = Object.values(pf).filter((v) => v.has_personal).length;
  const workCount = Object.values(pf).filter((v) => v.has_work).length;

  const { existingLists, existingTodos } = getExistingContext();

  const today = new Date().toISOString().split("T")[0];

  const listsContext = existingLists.length > 0
    ? existingLists
        .map((l) => `- "${l.name}" (${l.isTimeBound ? "time-bound" : "timeless"}): ${l.summary || "no description"} [${l.itemCount} items]`)
        .join("\n")
    : "(No existing lists yet)";

  const todosContext = existingTodos.length > 0
    ? existingTodos
        .map((t) => {
          const list = existingLists.find((l) => l.id === t.listId);
          return `- [${list?.name || "?"}] ${t.title}`;
        })
        .join("\n")
    : "(No existing TODOs)";

  return NextResponse.json({
    defaultPrompt: DEFAULT_PLAN_PROMPT
      .replace("{TODAY}", today)
      .replace("{EXISTING_LISTS}", listsContext)
      .replace("{EXISTING_TODOS}", todosContext),
    personalNoteCount: personalCount,
    workNoteCount: workCount,
    existingListCount: existingLists.length,
    existingTodoCount: existingTodos.length,
  });
}
