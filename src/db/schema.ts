import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const lists = sqliteTable("lists", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  summary: text("summary").notNull().default(""),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
  isTimeBound: integer("is_time_bound", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  itemCount: integer("item_count").notNull().default(0),
});

export const todos = sqliteTable("todos", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content"),
  listId: text("list_id").notNull().references(() => lists.id),
  
  // Temporal
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  nextReminder: integer("next_reminder", { mode: "timestamp" }),
  reminderCadence: text("reminder_cadence"), // "daily", "weekly", "2 weeks", etc.
  
  // Status
  status: text("status", { enum: ["active", "completed", "archived"] }).notNull().default("active"),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  
  // Source tracking
  source: text("source", { enum: ["magic_input", "obsidian", "manual"] }).notNull().default("magic_input"),
  sourceRef: text("source_ref"),
  
  // LLM-extracted metadata
  tags: text("tags", { mode: "json" }).$type<string[]>().default([]),
  effort: text("effort", { enum: ["quick", "medium", "deep"] }),

  // Priority
  manualPriority: real("manual_priority").notNull().default(0),
});

// Simple key-value store for app-level settings (e.g. sidebar category order)
export const meta = sqliteTable("meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// Types
export type List = typeof lists.$inferSelect;
export type NewList = typeof lists.$inferInsert;
export type Todo = typeof todos.$inferSelect;
export type NewTodo = typeof todos.$inferInsert;


