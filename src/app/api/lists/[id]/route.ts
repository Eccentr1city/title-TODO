import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lists, todos, type NewList } from "@/db/schema";
import { eq } from "drizzle-orm";
import { listJSON } from "@/lib/serialize";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const [list] = await db.select().from(lists).where(eq(lists.id, id)).limit(1);
  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  const updates: Partial<NewList> = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    updates.name = name;
  }

  // The sidebar groups lists by their first tag; "category" moves the list
  // between groups. null/"" means ungrouped (drop the first tag).
  if (body.category !== undefined) {
    const rest = (list.tags || []).slice(1);
    updates.tags = body.category ? [body.category, ...rest] : rest;
  }

  if (body.summary !== undefined) updates.summary = String(body.summary).trim();
  if (body.isTimeBound !== undefined) updates.isTimeBound = !!body.isTimeBound;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const [updated] = db.update(lists).set(updates).where(eq(lists.id, id)).returning().all();
  return NextResponse.json(listJSON(updated));
}

// Deletes the list and everything in it (active, completed and trashed).
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deleted = db.transaction((tx) => {
    const items = tx.delete(todos).where(eq(todos.listId, id)).returning({ id: todos.id }).all();
    const removed = tx.delete(lists).where(eq(lists.id, id)).returning({ id: lists.id }).all();
    return removed.length ? items.length : null;
  });
  if (deleted === null) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }
  return NextResponse.json({ deletedItems: deleted });
}
