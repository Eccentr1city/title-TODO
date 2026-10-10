import webpush from "web-push";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";

// VAPID keys live in the secrets env file (source of truth: 1Password).
// Without them push is simply off: the UI hides the toggle and the reminder
// loop doesn't start.
const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || "mailto:adam@drleora.com";

export const pushConfigured = Boolean(publicKey && privateKey);
export const vapidPublicKey = publicKey ?? null;

if (pushConfigured) {
  webpush.setVapidDetails(subject, publicKey!, privateKey!);
}

// Read by public/sw.js. Every push must show a notification — iOS revokes
// subscriptions that receive silent pushes.
export type PushPayload = {
  title: string;
  body?: string;
  tag?: string;
  url?: string;
  badge?: number;
};

// Sends to every subscribed device; prunes subscriptions the push service
// reports as gone (app deleted from the home screen, permission revoked).
export async function sendToAll(payload: PushPayload): Promise<number> {
  if (!pushConfigured) return 0;
  const subs = await db.select().from(pushSubscriptions);
  const body = JSON.stringify(payload);

  const results = await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          { TTL: 60 * 60 * 24 }
        );
        return true;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint));
        } else {
          console.error("Push send failed:", status, err instanceof Error ? err.message : err);
        }
        return false;
      }
    })
  );
  return results.filter(Boolean).length;
}
