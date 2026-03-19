import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

// Store data in iCloud for automatic backup
const icloudDir = path.join(
  process.env.HOME || "",
  "Library/Mobile Documents/com~apple~CloudDocs/title-TODO"
);
// Fallback to local data/ directory if iCloud isn't available
const dataDir = fs.existsSync(icloudDir)
  ? icloudDir
  : path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "todos.db");
const sqlite = new Database(dbPath);

// Enable WAL mode for better concurrency
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite, { schema });

// Initialize tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS lists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    is_time_bound INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    item_count INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT,
    list_id TEXT NOT NULL REFERENCES lists(id),
    created_at INTEGER NOT NULL,
    next_reminder INTEGER,
    reminder_cadence TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    completed_at INTEGER,
    source TEXT NOT NULL DEFAULT 'magic_input',
    source_ref TEXT,
    tags TEXT DEFAULT '[]',
    effort TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_todos_list_id ON todos(list_id);
  CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);
  CREATE INDEX IF NOT EXISTS idx_todos_next_reminder ON todos(next_reminder);
`);

// Migrations for existing databases
const columns = sqlite.pragma("table_info(todos)") as { name: string }[];
const columnNames = new Set(columns.map((c) => c.name));

if (!columnNames.has("manual_priority")) {
  sqlite.exec("ALTER TABLE todos ADD COLUMN manual_priority REAL NOT NULL DEFAULT 0");
}


