"use client";

import { useEffect, useRef, useState } from "react";
import { TodoList } from "@/lib/types";

interface SidebarProps {
  lists: TodoList[];
  selectedView: string | null;
  onSelectView: (view: string | null) => void;
  inboxCount: number;
  completedCount: number;
  highlightedListIds?: Set<string>;
  onRefresh: () => void | Promise<void>;
}

const UNGROUPED = "ungrouped";
const COLLAPSED_KEY = "sidebarCollapsed";

type DragItem =
  | { type: "category"; tag: string }
  | { type: "list"; id: string };

export function Sidebar({ lists, selectedView, onSelectView, inboxCount, completedCount, highlightedListIds, onRefresh }: SidebarProps) {
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ type: "category" | "list"; key: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const dragItemRef = useRef<DragItem | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Load saved category order + collapse state
  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => setCategoryOrder(data.order || []))
      .catch(() => {});
    try {
      const saved = localStorage.getItem(COLLAPSED_KEY);
      if (saved) setCollapsed(new Set(JSON.parse(saved)));
    } catch {}
  }, []);

  useEffect(() => {
    if (editing) editInputRef.current?.select();
  }, [editing]);

  // Group lists by their first tag
  const groupedLists = lists.reduce((acc, list) => {
    const tag = list.tags[0] || UNGROUPED;
    if (!acc[tag]) acc[tag] = [];
    acc[tag].push(list);
    return acc;
  }, {} as Record<string, TodoList[]>);

  // Order: saved manual order first, then unknown tags alphabetically, ungrouped last
  const sortedTags = Object.keys(groupedLists).sort((a, b) => {
    if (a === UNGROUPED) return 1;
    if (b === UNGROUPED) return -1;
    const ia = categoryOrder.indexOf(a);
    const ib = categoryOrder.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });

  const toggleCollapsed = (tag: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };

  const startEdit = (type: "category" | "list", key: string, currentValue: string) => {
    setEditing({ type, key });
    setEditValue(currentValue);
  };

  const commitEdit = async () => {
    if (!editing) return;
    const value = editValue.trim();
    const { type, key } = editing;
    setEditing(null);
    if (!value) return;

    if (type === "list") {
      const list = lists.find((l) => l.id === key);
      if (!list || list.name === value) return;
      await fetch(`/api/lists/${key}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: value }),
      });
    } else {
      if (key === value) return;
      await fetch("/api/categories", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ oldName: key, newName: value }),
      });
    }
    await onRefresh();
  };

  const saveCategoryOrder = async (order: string[]) => {
    setCategoryOrder(order);
    await fetch("/api/categories", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ order }),
    });
  };

  const handleDropOnCategory = async (targetTag: string) => {
    const item = dragItemRef.current;
    dragItemRef.current = null;
    setDropTarget(null);
    if (!item) return;

    if (item.type === "category") {
      if (item.tag === targetTag || targetTag === UNGROUPED) return;
      // Reorder: move dragged tag to sit before the target tag
      const current = sortedTags.filter((t) => t !== UNGROUPED);
      const without = current.filter((t) => t !== item.tag);
      const idx = without.indexOf(targetTag);
      without.splice(idx === -1 ? without.length : idx, 0, item.tag);
      await saveCategoryOrder(without);
    } else {
      // Move list into this category
      const list = lists.find((l) => l.id === item.id);
      const currentTag = list?.tags[0] || UNGROUPED;
      if (!list || currentTag === targetTag) return;
      await fetch(`/api/lists/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category: targetTag === UNGROUPED ? null : targetTag }),
      });
      await onRefresh();
    }
  };

  const viewButton = (view: string | null, label: string, icon: string, count: number) => (
    <button
      onClick={() => onSelectView(view)}
      className={`w-full text-left px-4 py-3 flex items-center justify-between
                  transition-all duration-150
                  ${selectedView === view
                    ? "bg-background-tertiary text-accent glow-text"
                    : "hover:bg-background-tertiary text-text-normal"}`}
    >
      <span className="flex items-center gap-2">
        <span>{icon}</span>
        <span>{label}</span>
      </span>
      {count > 0 && <span className="text-sm text-text-muted">({count})</span>}
    </button>
  );

  return (
    <aside className="w-64 h-full bg-background-secondary border-r border-border flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h1 className="text-xl heat-1 font-bold tracking-wider">TODO</h1>
      </div>

      {/* Main Views */}
      <div className="border-b border-border">
        {viewButton(null, "Inbox", ">", inboxCount)}
        {viewButton("__completed__", "Completed", "v", completedCount)}
      </div>

      {/* Lists */}
      <div className="flex-1 overflow-y-auto py-2">
        {sortedTags.map((tag) => {
          const isCollapsed = collapsed.has(tag);
          const isDropTarget = dropTarget === tag;
          const isEditingCategory = editing?.type === "category" && editing.key === tag;

          return (
            <div
              key={tag}
              className={`mb-2 ${isDropTarget ? "bg-background-tertiary/50 rounded" : ""}`}
              onDragOver={(e) => {
                if (dragItemRef.current) {
                  e.preventDefault();
                  setDropTarget(tag);
                }
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDropTarget((prev) => (prev === tag ? null : prev));
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleDropOnCategory(tag);
              }}
            >
              {/* Category header */}
              <div
                draggable={tag !== UNGROUPED && !isEditingCategory}
                onDragStart={(e) => {
                  dragItemRef.current = { type: "category", tag };
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  dragItemRef.current = null;
                  setDropTarget(null);
                }}
                className={`px-2 py-1 flex items-center gap-1 text-xs text-text-faint uppercase tracking-widest select-none
                            ${tag !== UNGROUPED ? "cursor-grab active:cursor-grabbing" : ""}`}
              >
                <button
                  onClick={() => toggleCollapsed(tag)}
                  className="w-4 text-text-faint hover:text-accent transition-colors"
                  aria-label={isCollapsed ? "Expand category" : "Collapse category"}
                >
                  {isCollapsed ? "▸" : "▾"}
                </button>
                {isEditingCategory ? (
                  <input
                    ref={editInputRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") setEditing(null);
                    }}
                    className="flex-1 min-w-0 bg-background-tertiary text-text-normal text-xs uppercase tracking-widest
                               px-1 py-0.5 rounded border border-border outline-none focus:border-accent"
                  />
                ) : (
                  <span
                    className="truncate"
                    onDoubleClick={() => {
                      if (tag !== UNGROUPED) startEdit("category", tag, tag);
                    }}
                    title={tag !== UNGROUPED ? "Double-click to rename, drag to reorder" : undefined}
                  >
                    {tag === UNGROUPED ? "ungrouped" : `#${tag}`}
                  </span>
                )}
                {isCollapsed && (
                  <span className="ml-auto normal-case tracking-normal">
                    {groupedLists[tag].length}
                  </span>
                )}
              </div>

              {/* Lists in category */}
              {!isCollapsed &&
                groupedLists[tag].map((list) => {
                  const isEditingList = editing?.type === "list" && editing.key === list.id;
                  return (
                    <div
                      key={list.id}
                      draggable={!isEditingList}
                      onDragStart={(e) => {
                        dragItemRef.current = { type: "list", id: list.id };
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        dragItemRef.current = null;
                        setDropTarget(null);
                      }}
                    >
                      {isEditingList ? (
                        <div className="px-4 py-2 flex items-center gap-2">
                          <span className="text-text-faint">{list.isTimeBound ? "-" : "*"}</span>
                          <input
                            ref={editInputRef}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit();
                              if (e.key === "Escape") setEditing(null);
                            }}
                            className="flex-1 min-w-0 bg-background-tertiary text-text-normal text-sm
                                       px-1 py-0.5 rounded border border-border outline-none focus:border-accent"
                          />
                        </div>
                      ) : (
                        <button
                          onClick={() => onSelectView(list.id)}
                          onDoubleClick={() => startEdit("list", list.id, list.name)}
                          title="Double-click to rename, drag to move between categories"
                          className={`w-full text-left px-4 py-2 flex items-center justify-between
                                     transition-all duration-150 cursor-grab active:cursor-grabbing
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
                      )}
                    </div>
                  );
                })}
            </div>
          );
        })}
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
