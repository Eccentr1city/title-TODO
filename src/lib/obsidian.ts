import fs from "fs";
import path from "path";
import { z } from "zod";
import { DATA_DIR, NOTES_DIR } from "./paths";
import { readJson, writeJson } from "./json-file";
import { loadPrompt } from "./prompts";
import { localDateISO } from "./dates";

// Shared state for the Obsidian import routes: which notes were triaged, and
// what the triage found in each.

const STATE_FILE = path.join(DATA_DIR, "obsidian-sync-state.json");

export const DEFAULT_TRIAGE_PROMPT = loadPrompt("obsidian-triage.txt");

export const TriageResult = z.object({
  has_personal: z.boolean(),
  has_work: z.boolean(),
  personal_summary: z.string().describe("Brief description of personal TODOs found, or empty"),
  work_summary: z.string().describe("Brief description of work TODOs found, or empty"),
});
export type TriageResult = z.infer<typeof TriageResult>;

export type SyncState = {
  lastRunAt: string;
  triagePrompt: string;
  processedFiles: Record<string, TriageResult & { mtimeMs: number }>;
};

export function loadSyncState(): SyncState {
  const state = readJson<Partial<SyncState>>(STATE_FILE, {});
  return {
    lastRunAt: state.lastRunAt ?? "",
    triagePrompt: state.triagePrompt || DEFAULT_TRIAGE_PROMPT,
    processedFiles: state.processedFiles ?? {},
  };
}

export function saveSyncState(state: SyncState): void {
  writeJson(STATE_FILE, state);
}

export type Note = { relPath: string; fullPath: string; mtimeMs: number };

export function listNotes(): Note[] {
  const notes: Note[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".md")) {
        notes.push({
          relPath: path.relative(NOTES_DIR, full),
          fullPath: full,
          mtimeMs: fs.statSync(full).mtimeMs,
        });
      }
    }
  };
  walk(NOTES_DIR);
  return notes;
}

export function isNewOrModified(note: Note, state: SyncState): boolean {
  const prev = state.processedFiles[note.relPath];
  return !prev || note.mtimeMs > prev.mtimeMs;
}

// A note formatted for a prompt, or null if it doesn't exist. Paths come from
// the client, so anything resolving outside the vault is refused.
export function readNoteForPrompt(relPath: string): string | null {
  const fullPath = path.resolve(NOTES_DIR, relPath);
  if (!fullPath.startsWith(path.resolve(NOTES_DIR) + path.sep)) return null;
  if (!fs.existsSync(fullPath)) return null;
  const content = fs.readFileSync(fullPath, "utf-8");
  const mtime = localDateISO(fs.statSync(fullPath).mtime);
  return `=== ${relPath} (last modified: ${mtime}) ===\n${content}\n`;
}
