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
  }

  // Delete newly created lists that are now empty
  const deletedListIds: string[] = [];
  if (Array.isArray(listIds) && listIds.length > 0) {
    for (const listId of listIds) {
      const remaining = db
        .select({ count: sql<number>`count(*)` })
        .from(todos)
        .where(eq(todos.listId, listId))
        .get();
      if (remaining && remaining.count === 0) {
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
