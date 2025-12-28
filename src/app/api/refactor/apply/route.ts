import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lists, todos } from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";

interface RefactorSuggestion {
  action: "merge" | "rename" | "split" | "retag" | "delete";
  listIds: string[];
  newName?: string;
  newSummary?: string;
  newTags?: string[];
}

export async function POST(request: NextRequest) {
  const { suggestion } = (await request.json()) as { suggestion: RefactorSuggestion };

  if (!suggestion || !suggestion.action || !suggestion.listIds) {
    return NextResponse.json({ error: "Invalid suggestion" }, { status: 400 });
  }

  const { action, listIds, newName, newSummary, newTags } = suggestion;

  try {
    switch (action) {
      case "merge": {
        if (listIds.length < 2) {
          return NextResponse.json({ error: "Merge requires at least 2 lists" }, { status: 400 });
        }

        // Get existing lists
        const existingLists = await db
          .select()
          .from(lists)
          .where(inArray(lists.id, listIds))
          .all();

        if (existingLists.length === 0) {
          return NextResponse.json({ error: "Lists not found" }, { status: 404 });
        }

        // Create new merged list
        const mergedList = {
          id: uuid(),
          name: newName || existingLists.map((l) => l.name).join(" + "),
          summary: newSummary || existingLists.map((l) => l.summary).join(". "),
          tags: newTags || [...new Set(existingLists.flatMap((l) => l.tags || []))],
          isTimeBound: existingLists.some((l) => l.isTimeBound),
          createdAt: new Date(),
          itemCount: existingLists.reduce((sum, l) => sum + l.itemCount, 0),
        };

        await db.insert(lists).values(mergedList);

        // Move all todos to new list
        await db
          .update(todos)
          .set({ listId: mergedList.id })
          .where(inArray(todos.listId, listIds));

        // Delete old lists
        await db.delete(lists).where(inArray(lists.id, listIds));

        return NextResponse.json({ success: true, newListId: mergedList.id });
      }

      case "rename": {
        if (listIds.length !== 1) {
          return NextResponse.json({ error: "Rename requires exactly 1 list" }, { status: 400 });
        }

        const updates: Record<string, unknown> = {};
        if (newName) updates.name = newName;
        if (newSummary) updates.summary = newSummary;

        await db.update(lists).set(updates).where(eq(lists.id, listIds[0]));

        return NextResponse.json({ success: true });
      }

      case "retag": {
        if (!newTags) {
          return NextResponse.json({ error: "Retag requires newTags" }, { status: 400 });
        }

        for (const listId of listIds) {
          await db.update(lists).set({ tags: newTags }).where(eq(lists.id, listId));
        }

        return NextResponse.json({ success: true });
      }

      case "delete": {
        // Get the lists to check if they have items
        const listsToDelete = await db
          .select()
          .from(lists)
          .where(inArray(lists.id, listIds))
          .all();

        const hasItems = listsToDelete.some((l) => l.itemCount > 0);

        if (hasItems) {
          // Archive todos instead of deleting them
          await db
            .update(todos)
            .set({ status: "archived" })
            .where(inArray(todos.listId, listIds));
        }

        // Delete the lists
        await db.delete(lists).where(inArray(lists.id, listIds));

        return NextResponse.json({ success: true, archivedTodos: hasItems });
      }

      case "split": {
        // Split is more complex - we'd need LLM to decide which items go where
        // For now, just return a message that manual splitting is needed
        return NextResponse.json({ 
          success: false, 
          message: "Split action requires manual intervention. Please create new lists and move items manually." 
        });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Apply refactor error:", error);
    return NextResponse.json({ error: "Failed to apply suggestion" }, { status: 500 });
  }
}


