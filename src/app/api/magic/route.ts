import { NextRequest, NextResponse } from "next/server";
import { addFromText, isModelTier } from "@/lib/magic";
import { listJSON, todoJSON } from "@/lib/serialize";

export async function POST(request: NextRequest) {
  const { input, model } = await request.json();
  if (!input || typeof input !== "string") {
    return NextResponse.json({ error: "Input is required" }, { status: 400 });
  }

  try {
    const { createdLists, createdTodos } = await addFromText(input, isModelTier(model) ? model : "cheap");
    return NextResponse.json({
      todos: createdTodos.map(todoJSON),
      lists: createdLists.map((l) => listJSON(l, createdTodos.filter((t) => t.listId === l.id).length)),
    });
  } catch (error) {
    console.error("Magic input error:", error);
    return NextResponse.json({ error: "Failed to process input" }, { status: 500 });
  }
}
