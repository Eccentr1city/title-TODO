"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import type { TodoItem } from "./types";

// Which lists the Inbox hides ("blacklist") or shows exclusively ("whitelist").
// Each mode keeps its own selection, persisted server-side.
export type InboxFilter = { mode: "blacklist" | "whitelist"; blacklistIds: string[]; whitelistIds: string[] };

export function useInboxFilter() {
  const [filter, setFilter] = useState<InboxFilter>({ mode: "blacklist", blacklistIds: [], whitelistIds: [] });

  useEffect(() => {
    api<InboxFilter>("/api/inbox-filter").then(setFilter).catch(() => {});
  }, []);

  const update = (next: InboxFilter) => {
    setFilter(next);
    api("/api/inbox-filter", { method: "PUT", body: next }).catch(console.error);
  };

  const selected = filter.mode === "blacklist" ? filter.blacklistIds : filter.whitelistIds;
  const key = filter.mode === "blacklist" ? "blacklistIds" : "whitelistIds";

  return {
    filter,
    selected,
    setMode: (mode: InboxFilter["mode"]) => update({ ...filter, mode }),
    toggle: (listId: string) =>
      update({ ...filter, [key]: selected.includes(listId) ? selected.filter((id) => id !== listId) : [...selected, listId] }),
    clear: () => update({ ...filter, [key]: [] }),
    shows: (t: TodoItem) =>
      selected.length === 0 || (filter.mode === "blacklist" ? !selected.includes(t.listId) : selected.includes(t.listId)),
  };
}
