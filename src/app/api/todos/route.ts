import { NextRequest, NextResponse } from "next/server";
import { and, eq, type SQL } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { db } from "@/db";
import { todos, type Todo } from "@/db/schema";
import { todoJSON } from "@/lib/serialize";

const STATUSES = ["active", "completed", "archived"] as const;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const listId = searchParams.get("listId");
  const status = searchParams.get("status");

  const conditions: SQL[] = [];
  if (listId) conditions.push(eq(todos.listId, listId));
  if (status) {
    if (!STATUSES.includes(status as Todo["status"])) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    conditions.push(eq(todos.status, status as Todo["status"]));
  }

  const rows = db.select().from(todos).where(and(...conditions)).all();
  return NextResponse.json(rows.map(todoJSON));
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (typeof body.title !== "string" || !body.title.trim() || typeof body.listId !== "string") {
    return NextResponse.json({ error: "title and listId are required" }, { status: 400 });
  }

  const todo: Todo = {
    id: uuid(),
    title: body.title.trim(),
    content: body.content || null,
    listId: body.listId,
    createdAt: new Date(),
    nextReminder: body.nextReminder ? new Date(body.nextReminder) : null,
    notifiedReminder: null,
    reminderCadence: body.reminderCadence || null,
    status: "active",
    completedAt: null,
    source: body.source || "manual",
    sourceRef: body.sourceRef || null,
    tags: body.tags || [],
    effort: body.effort || null,
    manualPriority: 0,
  };
  db.insert(todos).values(todo).run();
  return NextResponse.json(todoJSON(todo));
}
