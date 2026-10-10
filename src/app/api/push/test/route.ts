import { NextResponse } from "next/server";
import { sendToAll } from "@/lib/push";
import { dueCount } from "@/lib/reminders";

export async function POST() {
  const sent = await sendToAll({
    title: "Notifications are on",
    body: "You'll get a push when a reminder comes due.",
    tag: "test",
    url: "/",
    badge: await dueCount(),
  });
  return NextResponse.json({ sent });
}
