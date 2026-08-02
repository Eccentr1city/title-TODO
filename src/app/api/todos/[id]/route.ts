import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { todos } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  // Get current todo to check for list change and status change
  const [currentTodo] = await db.select().from(todos).where(eq(todos.id, id)).limit(1);
  
  if (!currentTodo) {
    return NextResponse.json({ error: "Todo not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};

  if (body.title !== undefined) updates.title = body.title;
  if (body.content !== undefined) updates.content = body.content;
  if (body.listId !== undefined) updates.listId = body.listId;
  if (body.nextReminder !== undefined) {
    updates.nextReminder = body.nextReminder ? new Date(body.nextReminder) : null;
  }
  if (body.reminderCadence !== undefined) updates.reminderCadence = body.reminderCadence;
  if (body.status !== undefined) {
    updates.status = body.status;
    if (body.status === "completed") {
      updates.completedAt = new Date();
    } else {
      updates.completedAt = null;
    }
  }
  if (body.tags !== undefined) updates.tags = body.tags;
  if (body.effort !== undefined) updates.effort = body.effort;
  if (body.manualPriority !== undefined) updates.manualPriority = body.manualPriority;

  await db.update(todos).set(updates).where(eq(todos.id, id));

  // (list item counts are computed at read time — no maintenance needed)

  // Fetch updated todo
  const [updated] = await db.select().from(todos).where(eq(todos.id, id)).limit(1);

  return NextResponse.json({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    nextReminder: updated.nextReminder?.toISOString() || null,
    completedAt: updated.completedAt?.toISOString() || null,
    tags: updated.tags || [],
    manualPriority: updated.manualPriority ?? 0,
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [todo] = await db.select().from(todos).where(eq(todos.id, id)).limit(1);

  if (!todo) {
    return NextResponse.json({ error: "Todo not found" }, { status: 404 });
  }

  await db.delete(todos).where(eq(todos.id, id));

  return NextResponse.json({ success: true });
}


