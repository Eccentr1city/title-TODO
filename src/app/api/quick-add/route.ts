import { NextRequest } from "next/server";
import { db } from "@/db";
import { lists } from "@/db/schema";
import { addFromText } from "@/lib/magic";
import { describeWhen } from "@/lib/snooze";

// Magic input for iOS Shortcuts (share sheet, Siri, the Action button).
// Takes {"text": "..."} or a plain-text body and answers with one plain-text
// line the Shortcut can show as a notification.
export async function POST(request: NextRequest) {
  const raw = await request.text();
  let text = raw;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.text === "string") text = parsed.text;
  } catch {}
  text = text.trim();

  const reply = (body: string, status = 200) =>
    new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
  if (!text) return reply("Nothing to add.", 400);

  try {
    const { createdTodos } = await addFromText(text);
    if (createdTodos.length === 0) return reply("Nothing to add.");
    const names = new Map(db.select({ id: lists.id, name: lists.name }).from(lists).all().map((l) => [l.id, l.name]));
    return reply(
      createdTodos
        .map((t) => {
          const when = t.nextReminder ? ` (${describeWhen(t.nextReminder)})` : "";
          return `${t.title} → ${names.get(t.listId) ?? "?"}${when}`;
        })
        .join("\n")
    );
  } catch (err) {
    console.error("Quick add failed:", err);
    return reply(`Couldn't add that: ${err instanceof Error ? err.message : String(err)}`, 500);
  }
}
