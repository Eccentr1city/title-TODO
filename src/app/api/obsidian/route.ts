import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { structured } from "@/lib/anthropic";
import { notesAvailable, obsidianUnavailable } from "@/lib/paths";
import {
  DEFAULT_TRIAGE_PROMPT,
  TriageResult,
  isNewOrModified,
  listNotes,
  loadSyncState,
  saveSyncState,
} from "@/lib/obsidian";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// GET: return current state (prompt, results, stats)
export async function GET() {
  // Always answer with the normal shape: the page reads it on load. Without the
  // vault (e.g. on perihelion) past results still show, with no new notes.
  const vaultAvailable = notesAvailable();
  const state = loadSyncState();
  const allNotes = vaultAvailable ? listNotes() : [];
  const entries = Object.entries(state.processedFiles);

  return NextResponse.json({
    lastRunAt: state.lastRunAt,
    triagePrompt: state.triagePrompt,
    totalProcessed: entries.length,
    totalNotes: allNotes.length,
    newOrModifiedCount: allNotes.filter((n) => isNewOrModified(n, state)).length,
    personalNotes: entries.filter(([, v]) => v.has_personal).map(([k, v]) => ({ filename: k, ...v })),
    workNotes: entries.filter(([, v]) => v.has_work).map(([k, v]) => ({ filename: k, ...v })),
    vaultAvailable,
  });
}

// POST: run triage (accepts optional custom prompt, force flag)
export async function POST(request: NextRequest) {
  const unavailable = obsidianUnavailable();
  if (unavailable) return unavailable;
  const { prompt, force = false } = await request.json();

  const state = loadSyncState();
  const triagePrompt = prompt || state.triagePrompt || DEFAULT_TRIAGE_PROMPT;
  const allNotes = listNotes();
  const notes = force ? allNotes : allNotes.filter((n) => isNewOrModified(n, state));

  if (notes.length === 0) {
    return NextResponse.json({ message: "No new or modified notes to process", processed: 0 });
  }

  // All notes in parallel, with staggered starts; the SDK retries rate limits.
  const results = await Promise.all(
    notes.map(async (note, idx) => {
      await sleep(idx * 200);
      const content = fs.readFileSync(note.fullPath, "utf-8");
      try {
        const result = await structured(
          TriageResult,
          [{ role: "user", content: `Filename: ${note.relPath}\n\n---\n\n${content}` }],
          { model: "cheap", system: triagePrompt, maxTokens: 4096, effort: "low", maxRetries: 6 }
        );
        state.processedFiles[note.relPath] = { mtimeMs: note.mtimeMs, ...result };
        return { filename: note.relPath, ...result };
      } catch (err) {
        // Left unrecorded so the next run retries this note
        console.error(`Triage failed for ${note.relPath}:`, err);
        return {
          filename: note.relPath,
          has_personal: false,
          has_work: false,
          personal_summary: "",
          work_summary: `triage failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    })
  );

  state.lastRunAt = new Date().toISOString();
  state.triagePrompt = triagePrompt;
  saveSyncState(state);

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
