import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

// Where todos.db and the JSON state files live: $TITLE_TODO_DATA_DIR if set,
// else the iCloud folder (the original Mac setup), else ./data.
const icloudDir = path.join(
  process.env.HOME || "",
  "Library/Mobile Documents/com~apple~CloudDocs/title-TODO"
);
export const DATA_DIR =
  process.env.TITLE_TODO_DATA_DIR ||
  (fs.existsSync(icloudDir) ? icloudDir : path.join(process.cwd(), "data"));
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Obsidian vault for the import feature. Only present on the Mac; elsewhere the
// obsidian routes answer 503 instead of crashing on a missing directory.
export const NOTES_DIR =
  process.env.OBSIDIAN_NOTES_DIR || "/Users/adamkaufman/Documents/Adam's Notes";

export function notesAvailable(): boolean {
  return fs.existsSync(NOTES_DIR);
}

export function obsidianUnavailable(): NextResponse | null {
  if (notesAvailable()) return null;
  return NextResponse.json(
    { error: "Obsidian import isn't available here: the notes vault only exists on the Mac." },
    { status: 503 }
  );
}
