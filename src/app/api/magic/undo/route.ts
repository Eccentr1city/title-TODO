import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { todos, lists } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const { todoIds, listIds } = await request.json();

  if (!Array.isArray(todoIds) || todoIds.length === 0) {
    return NextResponse.json({ error: "todoIds array is required" }, { status: 400 });
  }

  const deletedTodoIds: string[] = [];

  for (const id of todoIds) {
    const [todo] = await db.select().from(todos).where(eq(todos.id, id)).limit(1);
    if (!todo) continue;

    await db.delete(todos).where(eq(todos.id, id));
    deletedTodoIds.push(id);

    if (todo.status === "active") {
      await db
        .update(lists)
        .set({ itemCount: sql`MAX(${lists.itemCount} - 1, 0)` })
        .where(eq(lists.id, todo.listId));
    }
  }

  // Delete newly created lists that are now empty
  const deletedListIds: string[] = [];
  if (Array.isArray(listIds) && listIds.length > 0) {
    for (const listId of listIds) {
      const [list] = await db.select().from(lists).where(eq(lists.id, listId)).limit(1);
      if (list && list.itemCount <= 0) {
        await db.delete(lists).where(eq(lists.id, listId));
        deletedListIds.push(listId);
      }
    }
  }

  return NextResponse.json({
    deletedTodoIds,
    deletedListIds,
  });
}
