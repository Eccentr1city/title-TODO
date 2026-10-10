// Runs once when the Next.js server starts. The production container is a
// single long-lived `next start` process, so a plain interval drives the
// background work: reminder notifications and emptying the trash.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Dev-mode reloads re-run register(); keep a single loop per process.
  const g = globalThis as { __backgroundLoop?: ReturnType<typeof setInterval> };
  if (g.__backgroundLoop) return;

  const [{ pushConfigured }, { checkReminders }, { purgeTrash }] = await Promise.all([
    import("@/lib/push"),
    import("@/lib/reminders"),
    import("@/lib/trash"),
  ]);

  const tick = async () => {
    try {
      if (pushConfigured) await checkReminders();
      const purged = purgeTrash();
      if (purged) console.log(`Emptied ${purged} todo(s) from the trash`);
    } catch (err) {
      console.error("Background tick failed:", err);
    }
  };
  g.__backgroundLoop = setInterval(tick, 60_000);
  tick();
}
