import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lists } from "@/db/schema";
import { eq } from "drizzle-orm";

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

  const updates: Record<string, unknown> = {};

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

  if (body.summary !== undefined) updates.summary = body.summary;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  await db.update(lists).set(updates).where(eq(lists.id, id));

  const [updated] = await db.select().from(lists).where(eq(lists.id, id)).limit(1);
  return NextResponse.json({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    tags: updated.tags || [],
  });
}
