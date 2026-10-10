// Runs once when the Next.js server starts. The production container is a
// single long-lived `next start` process, so a plain interval is enough to
// drive reminder notifications.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { pushConfigured } = await import("@/lib/push");
  if (!pushConfigured) return;

  // Dev-mode reloads re-run register(); keep a single loop per process.
  const g = globalThis as { __reminderLoop?: ReturnType<typeof setInterval> };
  if (g.__reminderLoop) return;

  const { checkReminders } = await import("@/lib/reminders");
  const tick = () =>
    checkReminders().catch((err) => console.error("Reminder check failed:", err));
  g.__reminderLoop = setInterval(tick, 60_000);
  tick();
}
