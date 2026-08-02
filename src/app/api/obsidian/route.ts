import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";
import fs from "fs";
import path from "path";
import { loadPrompt } from "@/lib/prompts";

const NOTES_DIR = "/Users/adamkaufman/Documents/Adam's Notes";
const ICLOUD_DIR = path.join(
  process.env.HOME || "",
  "Library/Mobile Documents/com~apple~CloudDocs/title-TODO"
);
const STATE_FILE = path.join(ICLOUD_DIR, "obsidian-sync-state.json");
const RAW_OUTPUTS_FILE = path.join(ICLOUD_DIR, "obsidian-triage-raw-outputs.json");

const DEFAULT_TRIAGE_PROMPT = loadPrompt("obsidian-triage.txt");

interface SyncState {
  lastRunAt: string;
  triagePrompt: string;
  processedFiles: Record<string, {
    mtimeMs: number;
    has_personal: boolean;
    has_work: boolean;
    personal_summary: string;
    work_summary: string;
  }>;
}

interface RawOutputs {
  [filename: string]: {
    raw_output: string;
    timestamp: string;
  };
}

function loadState(): SyncState {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  }
  return { lastRunAt: "", triagePrompt: DEFAULT_TRIAGE_PROMPT, processedFiles: {} };
}

function saveState(state: SyncState): void {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function loadRawOutputs(): RawOutputs {
  if (fs.existsSync(RAW_OUTPUTS_FILE)) {
    return JSON.parse(fs.readFileSync(RAW_OUTPUTS_FILE, "utf-8"));
  }
  return {};
}

function saveRawOutputs(outputs: RawOutputs): void {
  fs.writeFileSync(RAW_OUTPUTS_FILE, JSON.stringify(outputs, null, 2));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// GET: return current state (prompt, results, stats)
export async function GET() {
  const state = loadState();

  const allNotes = getAllNotes();
  const newOrModified = allNotes.filter((note) => {
    const prev = state.processedFiles[note.relPath];
    return !prev || note.mtimeMs > prev.mtimeMs;
  });

  const personal = Object.entries(state.processedFiles)
    .filter(([, v]) => v.has_personal)
    .map(([k, v]) => ({ filename: k, ...v }));

  const work = Object.entries(state.processedFiles)
    .filter(([, v]) => v.has_work)
    .map(([k, v]) => ({ filename: k, ...v }));

  return NextResponse.json({
    lastRunAt: state.lastRunAt,
    triagePrompt: state.triagePrompt || DEFAULT_TRIAGE_PROMPT,
    totalProcessed: Object.keys(state.processedFiles).length,
    totalNotes: allNotes.length,
    newOrModifiedCount: newOrModified.length,
    personalNotes: personal,
    workNotes: work,
  });
}

// POST: run triage (accepts optional custom prompt, force flag)
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { prompt, force = false } = body;

  const state = loadState();
  const rawOutputs = loadRawOutputs();
  const triagePrompt = prompt || state.triagePrompt || DEFAULT_TRIAGE_PROMPT;

  const allNotes = getAllNotes();
  const notes = force
    ? allNotes
    : allNotes.filter((note) => {
        const prev = state.processedFiles[note.relPath];
        return !prev || note.mtimeMs > prev.mtimeMs;
      });

  if (notes.length === 0) {
    return NextResponse.json({
      message: "No new or modified notes to process",
      processed: 0,
    });
  }

  // Process all in parallel with staggered starts
  const results = await Promise.all(
    notes.map(async (note, idx) => {
      await sleep(idx * 200);

      const content = fs.readFileSync(note.fullPath, "utf-8");

      // Retry loop for rate limits
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const response = await anthropic.messages.create({
            model: "claude-haiku-4-5",
            max_tokens: 512,
            system: triagePrompt,
            messages: [
              { role: "user", content: `Filename: ${note.relPath}\n\n---\n\n${content}` },
            ],
          });

          const textBlock = response.content.find((b) => b.type === "text");
          const raw = textBlock?.type === "text" ? textBlock.text : "";

          let jsonStr = raw;
          const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (fenceMatch) jsonStr = fenceMatch[1];

          let parsed = { has_personal: false, has_work: false, personal_summary: "", work_summary: "" };
          try {
            parsed = JSON.parse(jsonStr.trim());
          } catch { /* leave defaults */ }

          state.processedFiles[note.relPath] = {
            mtimeMs: note.mtimeMs,
            has_personal: parsed.has_personal ?? false,
            has_work: parsed.has_work ?? false,
            personal_summary: parsed.personal_summary ?? "",
            work_summary: parsed.work_summary ?? "",
          };

          rawOutputs[note.relPath] = {
            raw_output: raw,
            timestamp: new Date().toISOString(),
          };

          return {
            filename: note.relPath,
            has_personal: parsed.has_personal ?? false,
            has_work: parsed.has_work ?? false,
            personal_summary: parsed.personal_summary ?? "",
            work_summary: parsed.work_summary ?? "",
          };
        } catch (err: unknown) {
          if (err instanceof Error && (err.message.includes("429") || err.message.includes("rate_limit"))) {
            await sleep(Math.min((attempt + 1) * 3000, 15000));
            continue;
          }
          throw err;
        }
      }

      return {
        filename: note.relPath,
        has_personal: false,
        has_work: false,
        personal_summary: "",
        work_summary: "max retries exceeded",
      };
    })
  );

  state.lastRunAt = new Date().toISOString();
  state.triagePrompt = triagePrompt;
  saveState(state);
  saveRawOutputs(rawOutputs);

  const personal = results.filter((r) => r.has_personal);
  const work = results.filter((r) => r.has_work);

  return NextResponse.json({
    processed: results.length,
    personalCount: personal.length,
    workCount: work.length,
    personalNotes: personal,
    workNotes: work,
  });
}

function getAllNotes(): { relPath: string; fullPath: string; mtimeMs: number }[] {
  const notes: { relPath: string; fullPath: string; mtimeMs: number }[] = [];

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".md")) {
        const stat = fs.statSync(full);
        notes.push({
          relPath: path.relative(NOTES_DIR, full),
          fullPath: full,
          mtimeMs: stat.mtimeMs,
        });
      }
    }
  }

  walk(NOTES_DIR);
  return notes;
}
