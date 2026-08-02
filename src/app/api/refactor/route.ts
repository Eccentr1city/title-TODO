import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lists, todos } from "@/db/schema";
import { chat } from "@/lib/anthropic";
import { inArray } from "drizzle-orm";
import { loadPrompt } from "@/lib/prompts";

export async function POST(request: NextRequest) {
  const { listIds } = await request.json();

  if (!listIds || !Array.isArray(listIds) || listIds.length === 0) {
    return NextResponse.json({ error: "listIds is required" }, { status: 400 });
  }

  // Get the selected lists
  const selectedLists = await db
    .select()
    .from(lists)
    .where(inArray(lists.id, listIds))
    .all();

  if (selectedLists.length === 0) {
    return NextResponse.json({ error: "No lists found" }, { status: 404 });
  }

  // Get sample items from each list
  const listSamples: Record<string, string[]> = {};
  for (const list of selectedLists) {
    const items = await db
      .select({ title: todos.title })
      .from(todos)
      .where(inArray(todos.listId, [list.id]))
      .all();
    listSamples[list.id] = items.map((i) => i.title);
  }

  // Build context for Opus
  const listsContext = selectedLists
    .map((list) => {
      const samples = listSamples[list.id] || [];
      return `List: "${list.name}" (ID: ${list.id})
  Summary: ${list.summary || "No summary"}
  Tags: ${list.tags?.length ? list.tags.join(", ") : "none"}
  Items: ${samples.length}
  Time-bound: ${list.isTimeBound ? "yes" : "no (timeless)"}
  Sample items: ${samples.length > 0 ? samples.join("; ") : "none"}`;
    })
    .join("\n\n");

  try {
    const response = await chat(
      [
        {
          role: "user",
          content: `Analyze these ${selectedLists.length} lists and suggest organizational improvements:\n\n${listsContext}`,
        },
      ],
      {
        model: "expensive",
        system: loadPrompt("refactor.txt"),
        maxTokens: 16000,
      }
    );

    // Parse the response
    let parsed;
    try {
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, response];
      parsed = JSON.parse(jsonMatch[1] || response);
    } catch {
      console.error("Failed to parse refactor response:", response);
      return NextResponse.json(
        { suggestions: [], summary: "Failed to parse analysis results." },
        { status: 200 }
      );
    }

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Refactor analysis error:", error);
    return NextResponse.json(
      { error: "Failed to analyze lists" },
      { status: 500 }
    );
  }
}


