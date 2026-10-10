import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { pushConfigured, vapidPublicKey } from "@/lib/push";

// The VAPID keys come from the runtime env, so this must not be prerendered at build time.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ configured: pushConfigured, publicKey: vapidPublicKey });
}

// Body: a PushSubscription's toJSON()
export async function POST(request: NextRequest) {
  const sub = await request.json();
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }
  await db
    .insert(pushSubscriptions)
    .values({ endpoint, p256dh, auth, createdAt: new Date() })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { p256dh, auth } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const { endpoint } = await request.json();
  if (typeof endpoint === "string") {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  }
  return NextResponse.json({ ok: true });
}
