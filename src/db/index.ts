import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import { DATA_DIR } from "@/lib/paths";

const dbPath = path.join(DATA_DIR, "todos.db");
const sqlite = new Database(dbPath);

// Enable WAL mode for better concurrency
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite, { schema });

// Initialize tables and migrate. One IMMEDIATE transaction takes the write
// lock up front: `next build` opens the database from many workers at once,
// and concurrent check-then-ALTER sequences otherwise deadlock (SQLITE_BUSY).
sqlite.transaction(() => {
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

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  // Migrations for existing databases
  const columns = sqlite.pragma("table_info(todos)") as { name: string }[];
  const columnNames = new Set(columns.map((c) => c.name));

  if (!columnNames.has("manual_priority")) {
    sqlite.exec("ALTER TABLE todos ADD COLUMN manual_priority REAL NOT NULL DEFAULT 0");
  }

  if (!columnNames.has("notified_reminder")) {
    sqlite.exec("ALTER TABLE todos ADD COLUMN notified_reminder INTEGER");
    // Reminders that were already overdue before notifications existed count as
    // notified, so turning the feature on doesn't send a backlog.
    sqlite.exec(
      "UPDATE todos SET notified_reminder = next_reminder WHERE next_reminder IS NOT NULL AND next_reminder <= unixepoch()"
    );
  }
}).immediate();
