/**
 * Stage 1: Obsidian Note Triage
 *
 * Sends each note to Haiku in parallel to determine if it contains actionable items.
 * Classifies into work TODOs vs personal TODOs separately.
 * Tracks processing timestamps so future runs only process new/modified notes.
 * Saves full raw LLM outputs alongside parsed results.
 *
 * Usage: npx tsx scripts/obsidian-triage.ts [--force]
 *   --force: re-process all notes, ignoring previous timestamps
 */

import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { config } from "dotenv";

config({ path: path.join(__dirname, "../.env") });

const NOTES_DIR = "/Users/adamkaufman/Documents/Adam's Notes";
const ICLOUD_DIR = path.join(
  process.env.HOME || "",
  "Library/Mobile Documents/com~apple~CloudDocs/title-TODO"
);
const STATE_FILE = path.join(ICLOUD_DIR, "obsidian-sync-state.json");
const RAW_OUTPUTS_FILE = path.join(ICLOUD_DIR, "obsidian-triage-raw-outputs.json");

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const WORK_CONTEXT = `The author works on testing AI control methods in a setting called BashArena, and other miscellaneous AI safety projects at Anthropic. Work-related topics include: AI safety, control evaluations, untrusted monitoring, red-teaming, AI alignment research, BashBench, SHADE arena, machine learning experiments, research papers, coding for work projects, and anything involving colleagues or work deadlines.`;

const TRIAGE_PROMPT = `You are triaging an Obsidian note to determine if it contains items that should be tracked in a TODO app.

${WORK_CONTEXT}

For this note, determine SEPARATELY whether it contains:

1. PERSONAL TODOs: Non-work actionable items such as:
   - Personal errands, shopping, things to buy/acquire
   - Wishlists: books to read, movies/shows to watch, restaurants to try, music to listen to
   - Personal goals, resolutions, health/wellness intentions
   - Home improvement, moving, room organization tasks
   - Personal project ideas (creative, hobby, side projects)
   - Social plans, letters to write, people to contact
   - Travel plans, personal logistics

2. WORK TODOs: Work/research actionable items such as:
   - AI safety research tasks, experiments to run
   - BashArena / control evaluation tasks
   - Code to write for work, bugs to fix
   - Papers to write or review
   - Work meetings to schedule, feedback to give colleagues
   - Research directions to pursue

Answer NO for both if the note is:
- Pure journaling, reflection, or stream of consciousness with no actionable items
- Technical notes or reference material with no remaining tasks
- Records of past events with no follow-ups
- Creative writing, essays, or blog drafts (unless the note says "write a blog post about X" as a TODO)
- Notes that only contain completed/past tasks with nothing remaining
- Empty or near-empty notes
- Addresses, keys, credentials, or reference data

Respond with ONLY a JSON object (no markdown, no code fences) in this exact format:
{"has_personal": true/false, "has_work": true/false, "personal_summary": "brief description of personal TODOs found, or empty string", "work_summary": "brief description of work TODOs found, or empty string"}`;

interface TriageResult {
  has_personal: boolean;
  has_work: boolean;
  personal_summary: string;
  work_summary: string;
  raw_output: string;
}

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
  return { lastRunAt: "", triagePrompt: TRIAGE_PROMPT, processedFiles: {} };
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

function getNotesToProcess(
  allNotes: { relPath: string; fullPath: string; mtimeMs: number }[],
  state: SyncState,
  force: boolean
) {
  if (force) return allNotes;
  return allNotes.filter((note) => {
    const prev = state.processedFiles[note.relPath];
    return !prev || note.mtimeMs > prev.mtimeMs;
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function triageNote(
  filename: string,
  content: string,
  prompt: string
): Promise<TriageResult> {
  const maxRetries = 5;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        system: prompt,
        messages: [
          {
            role: "user",
            content: `Filename: ${filename}\n\n---\n\n${content}`,
          },
        ],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      const raw = textBlock?.type === "text" ? textBlock.text : "";

      // Try to parse JSON, stripping markdown fences if present
      let jsonStr = raw;
      const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) jsonStr = fenceMatch[1];
      jsonStr = jsonStr.trim();

      try {
        const parsed = JSON.parse(jsonStr);
        return {
          has_personal: parsed.has_personal ?? false,
          has_work: parsed.has_work ?? false,
          personal_summary: parsed.personal_summary ?? "",
          work_summary: parsed.work_summary ?? "",
          raw_output: raw,
        };
      } catch {
        return {
          has_personal: false,
          has_work: false,
          personal_summary: "",
          work_summary: "",
          raw_output: raw,
        };
      }
    } catch (err: unknown) {
      if (err instanceof Error && (err.message.includes("429") || err.message.includes("rate_limit"))) {
        const waitMs = Math.min((attempt + 1) * 3000, 15000);
        await sleep(waitMs);
        continue;
      }
      throw err;
    }
  }

  return { has_personal: false, has_work: false, personal_summary: "", work_summary: "", raw_output: "max retries exceeded" };
}

async function main() {
  const force = process.argv.includes("--force");
  const state = loadState();
  const rawOutputs = loadRawOutputs();
  const allNotes = getAllNotes();
  const notes = getNotesToProcess(allNotes, state, force);

  if (notes.length === 0) {
    console.log("No new or modified notes to process.");
    console.log(`Last run: ${state.lastRunAt}`);
    const personalCount = Object.values(state.processedFiles).filter((f) => f.has_personal).length;
    const workCount = Object.values(state.processedFiles).filter((f) => f.has_work).length;
    console.log(`Previously found: ${personalCount} with personal TODOs, ${workCount} with work TODOs`);
    return;
  }

  console.log(`Processing ${notes.length} note(s) in parallel...`);
  if (!force && Object.keys(state.processedFiles).length > 0) {
    console.log(`(${Object.keys(state.processedFiles).length} already processed)`);
  }
  console.log("");

  const prompt = state.triagePrompt || TRIAGE_PROMPT;

  // Launch ALL requests in parallel — rate limit retries are handled per-request
  const promises = notes.map(async (note, idx) => {
    // Stagger launches slightly to avoid all hitting at once
    await sleep(idx * 200);

    const content = fs.readFileSync(note.fullPath, "utf-8");
    const result = await triageNote(note.relPath, content, prompt);

    // Log result
    const personalIcon = result.has_personal ? "P" : " ";
    const workIcon = result.has_work ? "W" : " ";
    const hasAny = result.has_personal || result.has_work;
    const label = hasAny ? "YES" : " no";
    console.log(`[${label}] [${personalIcon}${workIcon}] ${note.relPath}`);
    if (result.has_personal) {
      console.log(`       personal: ${result.personal_summary.slice(0, 80)}`);
    }
    if (result.has_work) {
      console.log(`       work: ${result.work_summary.slice(0, 80)}`);
    }

    // Save to state
    state.processedFiles[note.relPath] = {
      mtimeMs: note.mtimeMs,
      has_personal: result.has_personal,
      has_work: result.has_work,
      personal_summary: result.personal_summary,
      work_summary: result.work_summary,
    };

    // Save raw output
    rawOutputs[note.relPath] = {
      raw_output: result.raw_output,
      timestamp: new Date().toISOString(),
    };

    return { relPath: note.relPath, ...result };
  });

  const results = await Promise.all(promises);

  state.lastRunAt = new Date().toISOString();
  state.triagePrompt = prompt;
  saveState(state);
  saveRawOutputs(rawOutputs);

  // Summary
  const personal = results.filter((r) => r.has_personal);
  const work = results.filter((r) => r.has_work);
  const both = results.filter((r) => r.has_personal && r.has_work);

  console.log("\n========================================");
  console.log(`RESULTS (${results.length} notes processed):`);
  console.log(`  Personal TODOs: ${personal.length} notes`);
  console.log(`  Work TODOs:     ${work.length} notes`);
  console.log(`  Both:           ${both.length} notes`);
  console.log(`  Neither:        ${results.length - personal.length - work.length + both.length} notes`);
  console.log("========================================\n");

  if (personal.length > 0) {
    console.log("PERSONAL TODO NOTES:");
    for (const r of personal.sort((a, b) => a.relPath.localeCompare(b.relPath))) {
      console.log(`  - ${r.relPath}`);
      if (r.personal_summary) console.log(`    ${r.personal_summary.slice(0, 100)}`);
    }
    console.log("");
  }

  if (work.length > 0) {
    console.log("WORK TODO NOTES:");
    for (const r of work.sort((a, b) => a.relPath.localeCompare(b.relPath))) {
      console.log(`  - ${r.relPath}`);
      if (r.work_summary) console.log(`    ${r.work_summary.slice(0, 100)}`);
    }
    console.log("");
  }

  console.log(`State saved to: ${STATE_FILE}`);
  console.log(`Raw outputs saved to: ${RAW_OUTPUTS_FILE}`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
