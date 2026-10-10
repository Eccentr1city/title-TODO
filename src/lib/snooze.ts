// Snooze choices at times people actually want, relative to now.

const at = (base: Date, days: number, hour: number) => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
};

export function snoozeOptions(now = new Date()): { label: string; until: Date }[] {
  const options = [{ label: "In 1 hour", until: new Date(now.getTime() + 60 * 60 * 1000) }];
  if (now.getHours() < 17) options.push({ label: "This evening", until: at(now, 0, 19) });
  options.push({ label: "Tomorrow morning", until: at(now, 1, 9) });
  const day = now.getDay(); // 0 = Sunday
  if (day >= 1 && day <= 4) options.push({ label: "This weekend", until: at(now, 6 - day, 10) });
  options.push({ label: "Next week", until: at(now, ((8 - day) % 7) || 7, 9) });
  options.push({ label: "Next month", until: at(now, 30, 9) });
  return options;
}

// "Tue 9:00 AM", "Oct 21", etc. — for showing when something will come back.
export function describeWhen(d: Date, now = new Date()): string {
  const days = Math.round((at(d, 0, 0).getTime() - at(now, 0, 0).getTime()) / 86_400_000);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (days === 0) return `today ${time}`;
  if (days === 1) return `tomorrow ${time}`;
  if (days > 1 && days < 7) return `${d.toLocaleDateString("en-US", { weekday: "short" })} ${time}`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
