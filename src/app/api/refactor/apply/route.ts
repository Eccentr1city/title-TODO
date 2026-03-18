import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lists, todos } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { v4 as uuid } from "uuid";

interface SplitTarget {
  newName: string;
  newSummary?: string;
  newTags?: string[];
  isTimeBound?: boolean;
  itemTitles: string[];
}

interface ItemEdit {
  oldTitle: string;
  newTitle?: string;
  newContent?: string;
  newTags?: string[];
  newEffort?: "quick" | "medium" | "deep" | null;
}

interface RefactorAction {
  action: "merge" | "rename" | "edit" | "split" | "retag" | "delete" | "move" | "edit_items";
  listIds: string[];
  newName?: string;
  newSummary?: string;
  newTags?: string[];
  splits?: SplitTarget[];
  targetListId?: string;
  itemTitles?: string[];
  items?: ItemEdit[];
}

async function applyAction(action: RefactorAction) {
  const { action: type, listIds, newName, newSummary, newTags, splits } = action;

  switch (type) {
    case "merge": {
      if (listIds.length < 2) throw new Error("Merge requires at least 2 lists");

      const existingLists = db
        .select()
        .from(lists)
        .where(inArray(lists.id, listIds))
        .all();

      if (existingLists.length === 0) throw new Error("Lists not found");

      const mergedList = {
        id: uuid(),
        name: newName || existingLists.map((l) => l.name).join(" + "),
        summary: newSummary || existingLists.map((l) => l.summary).join(". "),
        tags: newTags || [...new Set(existingLists.flatMap((l) => l.tags || []))],
        isTimeBound: existingLists.some((l) => l.isTimeBound),
        createdAt: new Date(),
        itemCount: existingLists.reduce((sum, l) => sum + l.itemCount, 0),
      };

      db.insert(lists).values(mergedList).run();
      db.update(todos)
        .set({ listId: mergedList.id })
        .where(inArray(todos.listId, listIds))
        .run();
      db.delete(lists).where(inArray(lists.id, listIds)).run();

      return { action: "merge", result: `Merged ${existingLists.map((l) => l.name).join(", ")} → ${mergedList.name}` };
    }

    case "edit":
    case "rename":
    case "retag": {
      const updates: Record<string, unknown> = {};
      if (newName) updates.name = newName;
      if (newSummary) updates.summary = newSummary;
      if (newTags) updates.tags = newTags;

      if (Object.keys(updates).length === 0) {
        return { action: "edit", result: `No changes to apply (no newName, newSummary, or newTags provided)` };
      }

      for (const listId of listIds) {
        db.update(lists).set(updates).where(eq(lists.id, listId)).run();
      }

      const parts: string[] = [];
      if (newName) parts.push(`name → "${newName}"`);
      if (newSummary) parts.push(`summary updated`);
      if (newTags) parts.push(`tags → [${newTags.join(", ")}]`);
      const listCount = listIds.length > 1 ? ` (${listIds.length} lists)` : "";
      return { action: "edit", result: parts.join(", ") + listCount };
    }

    case "delete": {
      const listsToDelete = db
        .select()
        .from(lists)
        .where(inArray(lists.id, listIds))
        .all();

      const itemCount = listsToDelete.reduce((sum, l) => sum + l.itemCount, 0);
      // Must delete todos first due to FK constraint
      db.delete(todos).where(inArray(todos.listId, listIds)).run();
      db.delete(lists).where(inArray(lists.id, listIds)).run();

      return {
        action: "delete",
        result: `Deleted ${listsToDelete.map((l) => l.name).join(", ")}${itemCount > 0 ? ` (${itemCount} items removed)` : ""}`,
      };
    }

    case "split": {
      if (listIds.length !== 1) throw new Error("Split requires exactly 1 list");
      if (!splits || splits.length === 0) throw new Error("Split requires at least 1 target list");

      const sourceList = db.select().from(lists).where(eq(lists.id, listIds[0])).get();
      if (!sourceList) throw new Error("Source list not found");

      const allItems = db.select().from(todos).where(eq(todos.listId, listIds[0])).all();
      const results: string[] = [];

      for (const split of splits) {
        const newList = {
          id: uuid(),
          name: split.newName,
          summary: split.newSummary || `Split from ${sourceList.name}`,
          tags: split.newTags || sourceList.tags || [],
          isTimeBound: split.isTimeBound ?? sourceList.isTimeBound,
          createdAt: new Date(),
          itemCount: 0,
        };

        db.insert(lists).values(newList).run();

        // Match items by title (case-insensitive)
        const titleSet = new Set(split.itemTitles.map((t) => t.toLowerCase()));
        const matchingItems = allItems.filter((item) =>
          titleSet.has(item.title.toLowerCase())
        );

        if (matchingItems.length > 0) {
          const matchingIds = matchingItems.map((i) => i.id);
          db.update(todos)
            .set({ listId: newList.id })
            .where(inArray(todos.id, matchingIds))
            .run();
          db.update(lists)
            .set({ itemCount: matchingItems.length })
            .where(eq(lists.id, newList.id))
            .run();
        }

        results.push(`${split.newName} (${matchingItems.length} items)`);
      }

      // Delete the original list (any unmatched items stay orphaned — shouldn't happen if Sonnet listed them all)
      const remainingItems = db.select().from(todos).where(eq(todos.listId, listIds[0])).all();
      if (remainingItems.length === 0) {
        db.delete(lists).where(eq(lists.id, listIds[0])).run();
      } else {
        // Update the item count for any remaining items
        db.update(lists)
          .set({ itemCount: remainingItems.length })
          .where(eq(lists.id, listIds[0]))
          .run();
      }

      return { action: "split", result: `Split "${sourceList.name}" → ${results.join(", ")}` };
    }

    case "move": {
      if (listIds.length !== 1) throw new Error("Move requires exactly 1 source list");
      if (!action.targetListId) throw new Error("Move requires a targetListId");
      if (!action.itemTitles || action.itemTitles.length === 0) throw new Error("Move requires itemTitles");

      const srcList = db.select().from(lists).where(eq(lists.id, listIds[0])).get();
      const dstList = db.select().from(lists).where(eq(lists.id, action.targetListId)).get();
      if (!srcList) throw new Error("Source list not found");
      if (!dstList) throw new Error("Target list not found");

      const srcItems = db.select().from(todos).where(eq(todos.listId, listIds[0])).all();
      const titleSet = new Set(action.itemTitles.map((t) => t.toLowerCase()));
      const toMove = srcItems.filter((item) => titleSet.has(item.title.toLowerCase()));

      if (toMove.length > 0) {
        const moveIds = toMove.map((i) => i.id);
        db.update(todos)
          .set({ listId: action.targetListId })
          .where(inArray(todos.id, moveIds))
          .run();

        // Update counts
        db.update(lists)
          .set({ itemCount: srcList.itemCount - toMove.length })
          .where(eq(lists.id, listIds[0]))
          .run();
        db.update(lists)
          .set({ itemCount: dstList.itemCount + toMove.length })
          .where(eq(lists.id, action.targetListId))
          .run();
      }

      return {
        action: "move",
        result: `Moved ${toMove.length} item(s) from "${srcList.name}" to "${dstList.name}"`,
      };
    }

    case "edit_items": {
      if (!action.items || action.items.length === 0) throw new Error("edit_items requires an items array");

      // Collect all todos from specified lists (or all active todos if no listIds)
      const scope = listIds.length > 0
        ? db.select().from(todos).where(inArray(todos.listId, listIds)).all()
        : db.select().from(todos).where(eq(todos.status, "active")).all();

      let edited = 0;
      const editDetails: string[] = [];

      for (const item of action.items) {
        const match = scope.find(
          (t) => t.title.toLowerCase() === item.oldTitle.toLowerCase()
        );
        if (!match) continue;

        const updates: Record<string, unknown> = {};
        if (item.newTitle !== undefined) updates.title = item.newTitle;
        if (item.newContent !== undefined) updates.content = item.newContent;
        if (item.newTags !== undefined) updates.tags = item.newTags;
        if (item.newEffort !== undefined) updates.effort = item.newEffort;

        if (Object.keys(updates).length === 0) continue;

        db.update(todos).set(updates).where(eq(todos.id, match.id)).run();
        edited++;

        if (item.newTitle && item.newTitle !== match.title) {
          editDetails.push(`"${match.title}" → "${item.newTitle}"`);
        }
      }

      return {
        action: "edit_items",
        result: `Edited ${edited} item(s)${editDetails.length > 0 ? ": " + editDetails.join("; ") : ""}`,
      };
    }

    default:
      throw new Error(`Unknown action: ${type}`);
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  // Support both single suggestion (legacy) and array of actions
  const actions: RefactorAction[] = body.actions || (body.suggestion ? [body.suggestion] : []);

  if (actions.length === 0) {
    return NextResponse.json({ error: "No actions provided" }, { status: 400 });
  }

  const results: { action: string; result: string }[] = [];
  const errors: string[] = [];

  for (const action of actions) {
    try {
      const result = await applyAction(action);
      results.push(result);
    } catch (err) {
      errors.push(`${action.action}: ${String(err)}`);
    }
  }

  return NextResponse.json({ success: errors.length === 0, results, errors });
}
