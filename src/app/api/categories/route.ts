import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lists, meta } from "@/db/schema";
import { eq } from "drizzle-orm";

const ORDER_KEY = "categoryOrder";

function getOrder(): string[] {
  const row = db.select().from(meta).where(eq(meta.key, ORDER_KEY)).get();
  if (!row) return [];
  try {
    return JSON.parse(row.value);
  } catch {
    return [];
  }
}

function saveOrder(order: string[]) {
  db.insert(meta)
    .values({ key: ORDER_KEY, value: JSON.stringify(order) })
    .onConflictDoUpdate({ target: meta.key, set: { value: JSON.stringify(order) } })
    .run();
}

// GET → saved display order of sidebar categories
export async function GET() {
  return NextResponse.json({ order: getOrder() });
}

// PUT { order: string[] } → save display order
export async function PUT(request: NextRequest) {
  const body = await request.json();
  if (!Array.isArray(body.order)) {
    return NextResponse.json({ error: "order must be an array" }, { status: 400 });
  }
  saveOrder(body.order.map(String));
  return NextResponse.json({ order: getOrder() });
}

// PATCH { oldName, newName } → rename a category (the first tag) across all lists
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const oldName = String(body.oldName || "").trim();
  const newName = String(body.newName || "").trim();
  if (!oldName || !newName) {
    return NextResponse.json({ error: "oldName and newName are required" }, { status: 400 });
  }

  const allLists = db.select().from(lists).all();
  let renamed = 0;
  for (const list of allLists) {
    const tags = list.tags || [];
    if (tags[0] === oldName) {
      db.update(lists)
        .set({ tags: [newName, ...tags.slice(1)] })
        .where(eq(lists.id, list.id))
        .run();
      renamed++;
    }
  }

  // Keep the saved order in sync (dedupe in case newName already exists)
  const order = getOrder();
  if (order.includes(oldName)) {
    const next = order.map((t) => (t === oldName ? newName : t));
    saveOrder([...new Set(next)]);
  }

  return NextResponse.json({ renamed });
}
