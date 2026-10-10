import type { TodoItem } from "./types";
import { localDateISO } from "./dates";

type ExportView = {
  title: string;
  summary?: string;
  sections: { heading?: string; todos: TodoItem[] }[];
  listName: (t: TodoItem) => string | undefined;
};

export function viewAsMarkdown({ title, summary, sections, listName }: ExportView): string {
  const count = sections.reduce((n, s) => n + s.todos.length, 0);
  const lines = [`# ${title} — ${count} ${count === 1 ? "item" : "items"} (${localDateISO()})`];
  if (summary) lines.push(`> ${summary}`);
  const fmt = (t: TodoItem) => {
    const meta = [
      listName(t) && `list: ${listName(t)}`,
      t.tags?.length && `tags: ${t.tags.join(", ")}`,
      t.effort && `effort: ${t.effort}`,
      t.nextReminder && `reminder: ${localDateISO(new Date(t.nextReminder))}`,
    ].filter(Boolean);
    let line = `- [${t.status === "completed" ? "x" : " "}] ${t.title}${meta.length ? ` _(${meta.join("; ")})_` : ""}`;
    if (t.content) line += `\n  - ${t.content.replace(/\n/g, "\n    ")}`;
    return line;
  };
  for (const s of sections) {
    if (!s.todos.length) continue;
    lines.push("", ...(s.heading ? [`## ${s.heading}`] : []), ...s.todos.map(fmt));
  }
  return lines.join("\n");
}

export function viewAsJson({ title, sections, listName }: ExportView): string {
  return JSON.stringify(
    {
      view: title,
      exportedAt: new Date().toISOString(),
      items: sections.flatMap((s) => s.todos).map((t) => ({
        title: t.title,
        content: t.content,
        list: listName(t) ?? null,
        status: t.status,
        tags: t.tags,
        effort: t.effort,
        nextReminder: t.nextReminder,
        reminderCadence: t.reminderCadence,
        createdAt: t.createdAt,
      })),
    },
    null,
    2
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
