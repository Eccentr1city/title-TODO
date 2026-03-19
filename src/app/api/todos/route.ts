import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { todos, lists } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const listId = searchParams.get("listId");
  const status = searchParams.get("status");

  let query = db.select().from(todos);
  
  if (listId) {
    query = query.where(eq(todos.listId, listId)) as typeof query;
  }
  if (status) {
    query = query.where(eq(todos.status, status as "active" | "completed" | "archived")) as typeof query;
  }

  const allTodos = await query.all();

  return NextResponse.json(
    allTodos.map((todo) => ({
      ...todo,
      createdAt: todo.createdAt.toISOString(),
      nextReminder: todo.nextReminder?.toISOString() || null,
      completedAt: todo.completedAt?.toISOString() || null,
      tags: todo.tags || [],
      manualPriority: todo.manualPriority ?? 0,
    }))
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const newTodo = {
    id: uuid(),
    title: body.title,
    content: body.content || null,
    listId: body.listId,
    createdAt: new Date(),
    nextReminder: body.nextReminder ? new Date(body.nextReminder) : null,
    reminderCadence: body.reminderCadence || null,
    status: "active" as const,
    completedAt: null,
    source: body.source || "manual",
    sourceRef: body.sourceRef || null,
    tags: body.tags || [],
    effort: body.effort || null,
  };

  await db.insert(todos).values(newTodo);

  // Update list item count
  await db
    .update(lists)
    .set({ itemCount: sql`${lists.itemCount} + 1` })
    .where(eq(lists.id, body.listId));

  return NextResponse.json({
    ...newTodo,
    createdAt: newTodo.createdAt.toISOString(),
    nextReminder: newTodo.nextReminder?.toISOString() || null,
    completedAt: null,
  });
}


