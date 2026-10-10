import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, notExists } from "drizzle-orm";
import { db } from "@/db";
import { todos, lists } from "@/db/schema";

// Undo a magic input: delete the todos it created, then any lists it created
// that are now empty.
export async function POST(request: NextRequest) {
  const { todoIds, listIds } = await request.json();

  if (!Array.isArray(todoIds) || todoIds.length === 0) {
    return NextResponse.json({ error: "todoIds array is required" }, { status: 400 });
  }

  return NextResponse.json(
    db.transaction((tx) => {
      const deletedTodoIds = tx
        .delete(todos)
        .where(inArray(todos.id, todoIds))
        .returning({ id: todos.id })
        .all()
        .map((r) => r.id);

      const deletedListIds =
        Array.isArray(listIds) && listIds.length > 0
          ? tx
              .delete(lists)
              .where(
                and(
                  inArray(lists.id, listIds),
                  notExists(tx.select().from(todos).where(eq(todos.listId, lists.id)))
                )
              )
              .returning({ id: lists.id })
              .all()
              .map((r) => r.id)
          : [];

      return { deletedTodoIds, deletedListIds };
    })
  );
}
