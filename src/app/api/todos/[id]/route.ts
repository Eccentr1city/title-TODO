import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { todos, type NewTodo } from "@/db/schema";
import { todoJSON } from "@/lib/serialize";
import { nextOccurrence } from "@/lib/cadence";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await request.json();

  const updates: Partial<NewTodo> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.content !== undefined) updates.content = body.content;
  if (body.listId !== undefined) updates.listId = body.listId;
  if (body.nextReminder !== undefined) {
    const reminder = body.nextReminder ? new Date(body.nextReminder) : null;
    if (reminder && Number.isNaN(reminder.getTime())) {
      return NextResponse.json({ error: "Invalid nextReminder" }, { status: 400 });
    }
    updates.nextReminder = reminder;
  }
  if (body.reminderCadence !== undefined) updates.reminderCadence = body.reminderCadence;
  if (body.status !== undefined) {
    updates.status = body.status;
    updates.completedAt = body.status === "completed" ? new Date() : null;
    updates.archivedAt = body.status === "archived" ? new Date() : null;

    // Completing a recurring todo reschedules it rather than closing it
    if (body.status === "completed") {
      const current = db.select().from(todos).where(eq(todos.id, id)).get();
      const cadence = body.reminderCadence !== undefined ? body.reminderCadence : current?.reminderCadence;
      const next = nextOccurrence(cadence, current?.nextReminder ?? null);
      if (next) {
        updates.status = "active";
        updates.completedAt = null;
        updates.nextReminder = next;
      }
    }
  }
  if (body.tags !== undefined) updates.tags = body.tags;
  if (body.effort !== undefined) updates.effort = body.effort;
  if (body.manualPriority !== undefined) updates.manualPriority = body.manualPriority;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const [updated] = db.update(todos).set(updates).where(eq(todos.id, id)).returning().all();
  if (!updated) {
    return NextResponse.json({ error: "Todo not found" }, { status: 404 });
  }
  return NextResponse.json(todoJSON(updated));
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const deleted = db.delete(todos).where(eq(todos.id, id)).returning({ id: todos.id }).all();
  if (deleted.length === 0) {
    return NextResponse.json({ error: "Todo not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
