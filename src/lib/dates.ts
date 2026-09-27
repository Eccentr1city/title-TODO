// Today's date as YYYY-MM-DD in the server's local time zone (TZ), not UTC:
// toISOString() rolls over to tomorrow at 5pm Pacific.
export function localDateISO(d: Date = new Date()): string {
  return d.toLocaleDateString("en-CA");
}
