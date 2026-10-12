import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { structured } from "@/lib/anthropic";
import { loadPrompt } from "@/lib/prompts";
import { promptNow } from "@/lib/dates";

const ParsedTime = z.object({
  when: z.string().nullable().describe("ISO 8601 local time with UTC offset, or null if no time was described"),
});

// Free text ("next Thursday at 8pm") → an exact time, for snoozing and
// setting reminders without a date picker.
export async function POST(request: NextRequest) {
  const { text } = await request.json();
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  try {
    const { when } = await structured(ParsedTime, [{ role: "user", content: text.trim() }], {
      model: "cheap",
      system: loadPrompt("parse-time.txt").replace("{DATETIME}", promptNow()),
      maxTokens: 2048,
      effort: "low",
    });
    const date = when ? new Date(when) : null;
    if (!date || Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: `Couldn't tell when "${text.trim()}" is` }, { status: 422 });
    }
    // A bare time that already passed today ("8pm" at 10pm) means tomorrow
    const now = Date.now();
    if (date.getTime() <= now && now - date.getTime() < 86_400_000) date.setDate(date.getDate() + 1);
    if (date.getTime() <= now) {
      return NextResponse.json({ error: `"${text.trim()}" is in the past` }, { status: 422 });
    }
    return NextResponse.json({ when: date.toISOString() });
  } catch (err) {
    console.error("parse-time failed:", err);
    return NextResponse.json({ error: "Couldn't read that time" }, { status: 500 });
  }
}
