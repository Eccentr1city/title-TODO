import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lists, todos } from "@/db/schema";
import { chat } from "@/lib/anthropic";
import { inArray } from "drizzle-orm";

const SYSTEM_PROMPT = `You are an expert at organizing TODO lists. Analyze the given lists and suggest ways to improve their organization.

Consider:
1. Lists that are too similar and could be merged
2. Lists with unclear names that could be renamed
3. Lists that are too broad and could be split
4. Lists with inconsistent or missing tags
5. Empty or nearly empty lists that could be deleted

For each suggestion, provide:
- action: "merge" | "rename" | "split" | "retag" | "delete"
- listIds: array of list IDs affected
- newName: (for merge/rename) the new name
- newSummary: (for merge/rename) the new summary
- newTags: (for retag) the new tags
- reason: brief explanation of why this change would help

Be thoughtful and conservative - only suggest changes that would genuinely improve organization.

IMPORTANT: Respond with ONLY valid JSON, no markdown formatting or code blocks.

Response format:
{
  "suggestions": [
    {
      "action": "merge",
      "listIds": ["id1", "id2"],
      "newName": "Combined List Name",
      "newSummary": "What this combined list contains",
      "reason": "These lists have significant overlap..."
    }
  ],
  "summary": "Overall assessment of the list organization..."
}`;

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
      .limit(10)
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
  Items: ${list.itemCount}
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
        model: "expensive", // Use Opus for this complex task
        system: SYSTEM_PROMPT,
        maxTokens: 4096,
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


