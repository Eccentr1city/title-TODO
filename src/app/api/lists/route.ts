import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { db } from "@/db";
import { lists, todos, type List } from "@/db/schema";
import { listJSON } from "@/lib/serialize";

export async function GET() {
  const allLists = db.select().from(lists).all();

  // itemCount is computed, not stored — the denormalized column drifted.
  const counts = db
    .select({ listId: todos.listId, count: sql<number>`count(*)` })
    .from(todos)
    .where(eq(todos.status, "active"))
    .groupBy(todos.listId)
    .all();
  const countByList = new Map(counts.map((c) => [c.listId, c.count]));

  return NextResponse.json(allLists.map((l) => listJSON(l, countByList.get(l.id) ?? 0)));
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const list: List = {
    id: uuid(),
    name,
    summary: body.summary || "",
    tags: body.tags || [],
    isTimeBound: body.isTimeBound ?? true,
    createdAt: new Date(),
    itemCount: 0,
  };
  db.insert(lists).values(list).run();
  return NextResponse.json(listJSON(list));
}
