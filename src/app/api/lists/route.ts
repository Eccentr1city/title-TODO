import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lists, todos } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";

export async function GET() {
  const allLists = await db.select().from(lists).all();

  // itemCount is computed, not stored — the denormalized column drifted.
  const counts = db
    .select({ listId: todos.listId, count: sql<number>`count(*)` })
    .from(todos)
    .where(eq(todos.status, "active"))
    .groupBy(todos.listId)
    .all();
  const countByList = new Map(counts.map((c) => [c.listId, c.count]));

  return NextResponse.json(
    allLists.map((list) => ({
      ...list,
      createdAt: list.createdAt.toISOString(),
      tags: list.tags || [],
      itemCount: countByList.get(list.id) || 0,
    }))
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  
  const newList = {
    id: uuid(),
    name: body.name,
    summary: body.summary || "",
    tags: body.tags || [],
    isTimeBound: body.isTimeBound ?? true,
    createdAt: new Date(),
    itemCount: 0,
  };

  await db.insert(lists).values(newList);

  return NextResponse.json({
    ...newList,
    createdAt: newList.createdAt.toISOString(),
  });
}


