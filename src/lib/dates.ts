// Today's date as YYYY-MM-DD in the server's local time zone (TZ), not UTC:
// toISOString() rolls over to tomorrow at 5pm Pacific.
export function localDateISO(d: Date = new Date()): string {
  return d.toLocaleDateString("en-CA");
}

// The server's current UTC offset, e.g. "-07:00".
export function utcOffset(d: Date = new Date()): string {
  const minutes = -d.getTimezoneOffset();
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

// "Now" for prompts that ask the model for reminder times. The explicit offset
// matters: without it models write local times with a "Z" suffix, which lands
// reminders 7-8 hours early (3am pings).
export function promptNow(d: Date = new Date()): string {
  const human = d.toLocaleString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
  return `${human} (UTC offset ${utcOffset(d)})`;
}
