import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db";
import { structured } from "@/lib/anthropic";
import { applyRefactorAction, refactorPrompt, RefactorPlan } from "@/lib/refactor";

// Implement: turn the refactor conversation into typed actions and apply them,
// each in its own transaction.
export async function POST(request: NextRequest) {
  const { messages } = (await request.json()) as { messages: Anthropic.MessageParam[] };
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages is required" }, { status: 400 });
  }

  let plan: RefactorPlan;
  try {
    plan = await structured(
      RefactorPlan,
      [...messages, { role: "user", content: "Implement the changes we agreed on." }],
      { model: "medium", system: refactorPrompt("refactor-extract.txt"), maxTokens: 16000, effort: "medium" }
    );
  } catch (err) {
    return NextResponse.json(
      { error: `Couldn't work out the changes: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }

  const results: { action: string; result: string }[] = [];
  const errors: string[] = [];
  for (const action of plan.actions) {
    try {
      results.push({ action: action.action, result: db.transaction(() => applyRefactorAction(action)) });
    } catch (err) {
      errors.push(`${action.action}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return NextResponse.json({ results, errors });
}
