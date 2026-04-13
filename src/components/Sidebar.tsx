"use client";

import { TodoList } from "@/lib/types";

interface SidebarProps {
  lists: TodoList[];
  selectedView: string | null;
  onSelectView: (view: string | null) => void;
  inboxCount: number;
  completedCount: number;
  highlightedListIds?: Set<string>;
}

export function Sidebar({ lists, selectedView, onSelectView, inboxCount, completedCount, highlightedListIds }: SidebarProps) {
  // Group lists by their first tag
  const groupedLists = lists.reduce((acc, list) => {
    const tag = list.tags[0] || "ungrouped";
    if (!acc[tag]) acc[tag] = [];
    acc[tag].push(list);
    return acc;
  }, {} as Record<string, TodoList[]>);

  const sortedTags = Object.keys(groupedLists).sort((a, b) => {
    if (a === "ungrouped") return 1;
    if (b === "ungrouped") return -1;
    return a.localeCompare(b);
  });

  return (
    <aside className="w-64 h-full bg-background-secondary border-r border-border flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h1 className="text-xl heat-1 font-bold tracking-wider">TODO</h1>
      </div>

      {/* Main Views */}
      <div className="border-b border-border">
        {/* Inbox */}
        <button
          onClick={() => onSelectView(null)}
          className={`w-full text-left px-4 py-3 flex items-center justify-between
                      transition-all duration-150
                      ${selectedView === null 
                        ? "bg-background-tertiary text-accent glow-text" 
                        : "hover:bg-background-tertiary text-text-normal"}`}
        >
          <span className="flex items-center gap-2">
            <span>&gt;</span>
            <span>Inbox</span>
          </span>
          {inboxCount > 0 && (
            <span className="text-sm text-text-muted">({inboxCount})</span>
          )}
        </button>

        {/* Completed */}
        <button
          onClick={() => onSelectView("__completed__")}
          className={`w-full text-left px-4 py-3 flex items-center justify-between
                      transition-all duration-150
                      ${selectedView === "__completed__" 
                        ? "bg-background-tertiary text-accent glow-text" 
                        : "hover:bg-background-tertiary text-text-normal"}`}
        >
          <span className="flex items-center gap-2">
            <span>v</span>
            <span>Completed</span>
          </span>
          {completedCount > 0 && (
            <span className="text-sm text-text-muted">({completedCount})</span>
          )}
        </button>
      </div>

      {/* Lists */}
      <div className="flex-1 overflow-y-auto py-2">
        {sortedTags.map((tag) => (
          <div key={tag} className="mb-2">
            {tag !== "ungrouped" && (
              <div className="px-4 py-1 text-xs text-text-faint uppercase tracking-widest">
                #{tag}
              </div>
            )}
            {groupedLists[tag].map((list) => (
              <button
                key={list.id}
                onClick={() => onSelectView(list.id)}
                className={`w-full text-left px-4 py-2 flex items-center justify-between
                           transition-all duration-150
                           ${selectedView === list.id
                             ? "bg-background-tertiary text-accent glow-text"
                             : "hover:bg-background-tertiary text-text-normal"}
                           ${highlightedListIds?.has(list.id) ? "sidebar-highlight" : ""}`}
              >
                <span className="flex items-center gap-2 truncate">
                  <span className="text-text-faint">{list.isTimeBound ? "-" : "*"}</span>
                  <span className="truncate">{list.name}</span>
                </span>
                {list.itemCount > 0 && (
                  <span className="text-sm text-text-faint">({list.itemCount})</span>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-border">
        <button
          onClick={() => onSelectView("__obsidian__")}
          className={`w-full text-left px-4 py-3 flex items-center gap-2
                      transition-all duration-150 text-sm
                      ${selectedView === "__obsidian__"
                        ? "bg-background-tertiary text-accent glow-text"
                        : "hover:bg-background-tertiary text-text-muted"}`}
        >
          <span>&#10022;</span>
          <span>Sync Obsidian</span>
        </button>
        <button
          onClick={() => onSelectView("__refactor__")}
          className={`w-full text-left px-4 py-3 flex items-center gap-2
                      transition-all duration-150 text-sm
                      ${selectedView === "__refactor__"
                        ? "bg-background-tertiary text-accent glow-text"
                        : "hover:bg-background-tertiary text-text-muted"}`}
        >
          <span>~</span>
          <span>Refactor Lists</span>
        </button>
        <div className="px-4 py-2 text-xs text-text-faint">
          {lists.length} lists | {lists.reduce((sum, l) => sum + l.itemCount, 0)} items
        </div>
      </div>
    </aside>
  );
}
