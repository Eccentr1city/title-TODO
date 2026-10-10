import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { todos } from "@/db/schema";

const KEEP_DAYS = 30;

// Deleted todos sit in the trash (status "archived") so a delete can be
// undone; after KEEP_DAYS they're removed for good.
export function purgeTrash(now = new Date()): number {
  const cutoff = new Date(now.getTime() - KEEP_DAYS * 86_400_000);
  return db
    .delete(todos)
    .where(and(eq(todos.status, "archived"), lt(todos.archivedAt, cutoff)))
    .returning({ id: todos.id })
    .all().length;
}
