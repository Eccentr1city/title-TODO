import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lists } from "@/db/schema";
import { v4 as uuid } from "uuid";

export async function GET() {
  const allLists = await db.select().from(lists).all();
  
  return NextResponse.json(
    allLists.map((list) => ({
      ...list,
      createdAt: list.createdAt.toISOString(),
      tags: list.tags || [],
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


