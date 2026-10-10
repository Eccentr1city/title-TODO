// Recurring todos: reminderCadence is free text ("daily", "weekly", "2 weeks",
// "every 3 days", "monthly"...). Completing a recurring todo schedules its next
// occurrence instead of closing it.

type Interval = { unit: "day" | "week" | "month" | "year"; n: number };

const WORDS: Record<string, Interval> = {
  daily: { unit: "day", n: 1 },
  weekly: { unit: "week", n: 1 },
  biweekly: { unit: "week", n: 2 },
  fortnightly: { unit: "week", n: 2 },
  monthly: { unit: "month", n: 1 },
  quarterly: { unit: "month", n: 3 },
  yearly: { unit: "year", n: 1 },
  annually: { unit: "year", n: 1 },
};

export function parseCadence(cadence: string | null | undefined): Interval | null {
  if (!cadence) return null;
  const s = cadence.trim().toLowerCase();
  if (WORDS[s]) return WORDS[s];
  const m = s.match(/^(?:every\s+)?(\d+|other)?\s*(day|week|month|year)s?$/);
  if (!m) return null;
  const n = m[1] === "other" ? 2 : m[1] ? parseInt(m[1], 10) : 1;
  return n > 0 ? { unit: m[2] as Interval["unit"], n } : null;
}

function add(d: Date, { unit, n }: Interval): Date {
  const r = new Date(d);
  if (unit === "day") r.setDate(r.getDate() + n);
  else if (unit === "week") r.setDate(r.getDate() + 7 * n);
  else {
    // Clamp to the month's last day: Jan 31 + 1 month is Feb 28, not Mar 3
    const months = unit === "month" ? n : 12 * n;
    const day = r.getDate();
    r.setDate(1);
    r.setMonth(r.getMonth() + months);
    r.setDate(Math.min(day, new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate()));
  }
  return r;
}

// The next reminder after `now`, stepping from the previous reminder so the
// time of day is kept (a 9am weekly reminder stays at 9am). Without a previous
// reminder, one interval from now at 9am.
export function nextOccurrence(
  cadence: string | null | undefined,
  previous: Date | null,
  now = new Date()
): Date | null {
  const interval = parseCadence(cadence);
  if (!interval) return null;
  let next: Date;
  if (previous) {
    next = add(previous, interval);
    while (next <= now) next = add(next, interval);
  } else {
    next = add(now, interval);
    next.setHours(9, 0, 0, 0);
  }
  return next;
}
