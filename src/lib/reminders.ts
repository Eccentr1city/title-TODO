import { and, eq, isNotNull, lte, ne, or, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { lists, todos } from "@/db/schema";
import { sendToAll } from "./push";

// Above this many reminders coming due in one check (e.g. after the server was
// down), send a single summary instead of a burst.
const MAX_INDIVIDUAL = 3;

const isDue = and(
  eq(todos.status, "active"),
  isNotNull(todos.nextReminder),
  lte(todos.nextReminder, sql`unixepoch()`)
);

export async function dueCount(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(todos).where(isDue);
  return row?.n ?? 0;
}

// Notifies once per reminder time: a todo is pending when its nextReminder has
// passed and differs from the value we last notified for.
export async function checkReminders(): Promise<void> {
  const pending = await db
    .select({
      id: todos.id,
      title: todos.title,
      nextReminder: todos.nextReminder,
      listName: lists.name,
    })
    .from(todos)
    .leftJoin(lists, eq(todos.listId, lists.id))
    .where(
      and(
        isDue,
        or(isNull(todos.notifiedReminder), ne(todos.notifiedReminder, todos.nextReminder))
      )
    );
  if (pending.length === 0) return;

  // Mark first so a slow or failing push service can't cause repeats.
  for (const t of pending) {
    await db.update(todos).set({ notifiedReminder: t.nextReminder }).where(eq(todos.id, t.id));
  }

  const badge = await dueCount();
  if (pending.length > MAX_INDIVIDUAL) {
    await sendToAll({
      title: `${pending.length} reminders due`,
      body: pending.map((t) => t.title).join(" · "),
      tag: "reminders-summary",
      url: "/",
      badge,
    });
    return;
  }
  for (const t of pending) {
    await sendToAll({
      title: t.title,
      body: t.listName ?? undefined,
      tag: `todo-${t.id}`,
      url: `/?todo=${t.id}`,
      badge,
    });
  }
}
