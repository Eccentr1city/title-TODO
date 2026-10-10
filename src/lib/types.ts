// Frontend-friendly types (dates as ISO strings)

export interface TodoItem {
  id: string;
  title: string;
  content: string | null;
  listId: string;
  createdAt: string;
  nextReminder: string | null;
  reminderCadence: string | null;
  status: "active" | "completed" | "archived";
  completedAt: string | null;
  source: "magic_input" | "obsidian" | "manual";
  sourceRef: string | null;
  tags: string[];
  effort: "quick" | "medium" | "deep" | null;
  manualPriority: number;
}

export interface TodoList {
  id: string;
  name: string;
  summary: string;
  tags: string[];
  isTimeBound: boolean;
  createdAt: string;
  itemCount: number;
}
