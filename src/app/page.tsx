"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { MagicInput } from "@/components/MagicInput";
import { Sidebar } from "@/components/Sidebar";
import { TodoCard } from "@/components/TodoCard";
import { TodoEditor } from "@/components/TodoEditor";
import { AskAboutList } from "@/components/AskAboutList";
import { RefactorLists } from "@/components/RefactorLists";
import { ObsidianSync } from "@/components/ObsidianSync";
import { TodoItem, TodoList } from "@/lib/types";
import { effectivePriority, computeVotePriority, priorityHeatClass } from "@/lib/priority";

// Special view IDs
const VIEW_INBOX = null;
const VIEW_COMPLETED = "__completed__";
const VIEW_REFACTOR = "__refactor__";
const VIEW_OBSIDIAN = "__obsidian__";
const VIEW_SEARCH = "__search__";

interface InboxFilter {
  mode: "blacklist" | "whitelist";
  listIds: string[];
}

export default function Home() {
  const [lists, setLists] = useState<TodoList[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [completedTodos, setCompletedTodos] = useState<TodoItem[]>([]);
  const [selectedView, setSelectedView] = useState<string | null>(VIEW_INBOX);
  const [isProcessing, setIsProcessing] = useState(false);
  const [editingTodo, setEditingTodo] = useState<TodoItem | null>(null);
  const [lastGeneration, setLastGeneration] = useState<{
    todoIds: string[];
    listIds: string[];
    todoListMap: Record<string, string>;
  } | null>(null);
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>({ mode: "blacklist", listIds: [] });
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [highlightedTodoIds, setHighlightedTodoIds] = useState<Set<string>>(new Set());
  const [highlightedListIds, setHighlightedListIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const viewBeforeSearchRef = useRef<string | null>(VIEW_INBOX);
  const [successToast, setSuccessToast] = useState<{ message: string; visible: boolean; exiting: boolean } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showSuccessNotification = useCallback((todoCount: number, listNames: string[], newListCount: number, affectedListIds: string[], newTodoIds: string[]) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);

    const parts: string[] = [];
    if (todoCount > 0) parts.push(`${todoCount} note${todoCount !== 1 ? "s" : ""} created`);
    if (newListCount > 0) parts.push(`${newListCount} new list${newListCount !== 1 ? "s" : ""}`);

    const listSummary = listNames.length > 0
      ? ` in ${listNames.length <= 2 ? listNames.join(" & ") : `${listNames.length} lists`}`
      : "";

    setHighlightedTodoIds(new Set(newTodoIds));
    setHighlightedListIds(new Set(affectedListIds));
    setSuccessToast({ message: parts.join(", ") + listSummary, visible: true, exiting: false });

    toastTimerRef.current = setTimeout(() => {
      setSuccessToast((prev) => prev ? { ...prev, exiting: true } : null);
      setTimeout(() => {
        setSuccessToast(null);
        setHighlightedTodoIds(new Set());
        setHighlightedListIds(new Set());
      }, 300);
    }, 3500);
  }, []);

  // Fetch initial data
  const fetchData = useCallback(async () => {
    const [listsRes, todosRes] = await Promise.all([
      fetch("/api/lists"),
      fetch("/api/todos?status=active"),
    ]);
    
    const listsData = await listsRes.json();
    const todosData = await todosRes.json();
    
    setLists(listsData);
    setTodos(todosData);
  }, []);

  // Fetch completed todos when switching to completed view
  const fetchCompleted = useCallback(async () => {
    const res = await fetch("/api/todos?status=completed");
    const data = await res.json();
    setCompletedTodos(data);
  }, []);

  // Fetch inbox filter
  const fetchFilter = useCallback(async () => {
    try {
      const res = await fetch("/api/inbox-filter");
      const data = await res.json();
      setInboxFilter(data);
    } catch {
      // Use default
    }
  }, []);

  const updateFilter = async (filter: InboxFilter) => {
    setInboxFilter(filter);
    await fetch("/api/inbox-filter", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(filter),
    });
  };

  const toggleListFilter = (listId: string) => {
    const newIds = inboxFilter.listIds.includes(listId)
      ? inboxFilter.listIds.filter((id) => id !== listId)
      : [...inboxFilter.listIds, listId];
    updateFilter({ ...inboxFilter, listIds: newIds });
  };

  useEffect(() => {
    fetchData();
    fetchFilter();

    const POLL_INTERVAL_MS = 30_000;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (!intervalId) {
        intervalId = setInterval(fetchData, POLL_INTERVAL_MS);
      }
    };

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchData();
        startPolling();
      } else {
        stopPolling();
      }
    };

    if (document.visibilityState === "visible") {
      startPolling();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchData, fetchFilter]);

  useEffect(() => {
    if (selectedView !== VIEW_COMPLETED) return;
    fetchCompleted();

    const POLL_INTERVAL_MS = 30_000;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (!intervalId) {
        intervalId = setInterval(fetchCompleted, POLL_INTERVAL_MS);
      }
    };

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchCompleted();
        startPolling();
      } else {
        stopPolling();
      }
    };

    if (document.visibilityState === "visible") {
      startPolling();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [selectedView, fetchCompleted]);

  // Handle magic input
  const handleMagicInput = async (text: string, model: "cheap" | "medium" | "expensive" = "cheap") => {
    setIsProcessing(true);
    try {
      const res = await fetch("/api/magic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: text, model }),
      });

      if (!res.ok) throw new Error("Failed to process");

      const data = await res.json();

      // Update local state with new todos and lists
      if (data.lists?.length > 0) {
        setLists((prev) => [...prev, ...data.lists]);
      }
      if (data.todos?.length > 0) {
        setTodos((prev) => [...prev, ...data.todos]);
        setLists((prev) =>
          prev.map((list) => {
            const newItems = data.todos.filter((t: TodoItem) => t.listId === list.id);
            return newItems.length > 0
              ? { ...list, itemCount: list.itemCount + newItems.length }
              : list;
          })
        );
      }

      const todoListMap: Record<string, string> = {};
      for (const t of data.todos || []) {
        todoListMap[t.id] = t.listId;
      }
      setLastGeneration({
        todoIds: (data.todos || []).map((t: TodoItem) => t.id),
        listIds: (data.lists || []).map((l: TodoList) => l.id),
        todoListMap,
      });

      const todoCount = (data.todos || []).length;
      const newListCount = (data.lists || []).length;
      const affectedListIds = [...new Set((data.todos || []).map((t: TodoItem) => t.listId))] as string[];
      const allLists = [...lists, ...(data.lists || [])];
      const listNames = affectedListIds.map(
        (id: string) => allLists.find((l) => l.id === id)?.name || "Unknown"
      );
      const newTodoIds = (data.todos || []).map((t: TodoItem) => t.id);

      if (todoCount > 0) {
        showSuccessNotification(todoCount, listNames, newListCount, affectedListIds, newTodoIds);
      }
    } catch (error) {
      console.error("Magic input error:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle undo of last magic generation
  const handleUndo = async () => {
    if (!lastGeneration) return;

    try {
      const res = await fetch("/api/magic/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lastGeneration),
      });

      if (!res.ok) throw new Error("Failed to undo");

      const { deletedTodoIds, deletedListIds } = await res.json();

      setTodos((prev) => prev.filter((t) => !deletedTodoIds.includes(t.id)));

      setLists((prev) => {
        const remaining = prev.filter((l) => !deletedListIds.includes(l.id));
        return remaining.map((list) => {
          const removedCount = deletedTodoIds.filter(
            (tid: string) => lastGeneration.todoListMap[tid] === list.id
          ).length;
          return removedCount > 0
            ? { ...list, itemCount: Math.max(0, list.itemCount - removedCount) }
            : list;
        });
      });

      setLastGeneration(null);
    } catch (error) {
      console.error("Undo error:", error);
    }
  };

  // Handle todo completion
  const handleComplete = async (id: string) => {
    const todo = todos.find((t) => t.id === id) || completedTodos.find((t) => t.id === id);
    if (!todo) return;

    const newStatus = todo.status === "completed" ? "active" : "completed";

    const res = await fetch(`/api/todos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });

    if (res.ok) {
      const updated = await res.json();
      
      if (newStatus === "completed") {
        // Move from active to completed
        setTodos((prev) => prev.filter((t) => t.id !== id));
        setCompletedTodos((prev) => [updated, ...prev]);
      } else {
        // Move from completed to active
        setCompletedTodos((prev) => prev.filter((t) => t.id !== id));
        setTodos((prev) => [...prev, updated]);
      }
      
      // Update list item count
      setLists((prev) =>
        prev.map((list) => {
          if (list.id === todo.listId) {
            return {
              ...list,
              itemCount: newStatus === "completed" 
                ? list.itemCount - 1 
                : list.itemCount + 1,
            };
          }
          return list;
        })
      );
    }
  };

  // Handle snooze
  const handleSnooze = async (id: string, until: Date) => {
    const res = await fetch(`/api/todos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nextReminder: until.toISOString() }),
    });

    if (res.ok) {
      const updated = await res.json();
      setTodos((prev) => prev.map((t) => (t.id === id ? updated : t)));
    }
  };

  // Handle edit save
  const handleSaveEdit = async (updates: Partial<TodoItem> & { id: string }) => {
    const res = await fetch(`/api/todos/${updates.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });

    if (res.ok) {
      const updated = await res.json();
      setTodos((prev) => prev.map((t) => (t.id === updates.id ? updated : t)));
      setCompletedTodos((prev) => prev.map((t) => (t.id === updates.id ? updated : t)));
    }
  };

  // Handle delete
  const handleDelete = async (id: string) => {
    const todo = todos.find((t) => t.id === id) || completedTodos.find((t) => t.id === id);
    if (!todo) return;

    const res = await fetch(`/api/todos/${id}`, {
      method: "DELETE",
    });

    if (res.ok) {
      setTodos((prev) => prev.filter((t) => t.id !== id));
      setCompletedTodos((prev) => prev.filter((t) => t.id !== id));
      
      // Update list item count if it was active
      if (todo.status === "active") {
        setLists((prev) =>
          prev.map((list) => {
            if (list.id === todo.listId) {
              return { ...list, itemCount: list.itemCount - 1 };
            }
            return list;
          })
        );
      }
    }
  };

  // Handle ask about list
  const handleAskAboutList = async (question: string): Promise<string> => {
    if (!selectedView || selectedView.startsWith("__")) return "Please select a list first.";

    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listId: selectedView, question }),
    });

    if (!res.ok) throw new Error("Failed to get response");

    const data = await res.json();
    return data.response;
  };

  // Handle refactor complete
  const handleRefactorComplete = () => {
    fetchData(); // Refresh all data
    setSelectedView(VIEW_INBOX);
  };

  // Determine what to display
  const isSearchView = selectedView === VIEW_SEARCH;
  const isCompletedView = selectedView === VIEW_COMPLETED;
  const isRefactorView = selectedView === VIEW_REFACTOR;
  const isObsidianView = selectedView === VIEW_OBSIDIAN;
  const isListView = selectedView && !selectedView.startsWith("__");
  const selectedList = isListView ? lists.find((l) => l.id === selectedView) : null;

  // Search helper
  const matchesSearch = useCallback((todo: TodoItem, query: string) => {
    const q = query.toLowerCase();
    if (todo.title.toLowerCase().includes(q)) return true;
    if (todo.content?.toLowerCase().includes(q)) return true;
    if (todo.tags?.some((t) => t.toLowerCase().includes(q))) return true;
    const listName = lists.find((l) => l.id === todo.listId)?.name;
    if (listName?.toLowerCase().includes(q)) return true;
    return false;
  }, [lists]);

  // Filter and sort todos
  const displayedTodos = isSearchView && searchQuery.trim()
    ? [...todos, ...completedTodos]
        .filter((todo) => matchesSearch(todo, searchQuery.trim()))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    : isCompletedView
      ? completedTodos.sort((a, b) => {
          if (!a.completedAt && !b.completedAt) return 0;
          if (!a.completedAt) return 1;
          if (!b.completedAt) return -1;
          return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
        })
      : todos
          .filter((todo) => {
            if (isListView) {
              return todo.listId === selectedView && todo.status === "active";
            }
            if (todo.status !== "active") return false;
            if (inboxFilter.listIds.length > 0) {
              if (inboxFilter.mode === "blacklist") {
                return !inboxFilter.listIds.includes(todo.listId);
              } else {
                return inboxFilter.listIds.includes(todo.listId);
              }
            }
            return true;
          })
          .sort((a, b) => {
            const diff = effectivePriority(b) - effectivePriority(a);
            if (Math.abs(diff) > 0.001) return diff;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });

  const inboxCount = todos.filter((t) => {
    if (t.status !== "active") return false;
    if (inboxFilter.listIds.length > 0) {
      if (inboxFilter.mode === "blacklist") return !inboxFilter.listIds.includes(t.listId);
      return inboxFilter.listIds.includes(t.listId);
    }
    return true;
  }).length;
  const completedCount = completedTodos.length;

  // Handle priority vote
  const handleVote = async (id: string, direction: "up" | "down") => {
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;

    const newManualPriority = computeVotePriority(todo, direction, displayedTodos);

    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, manualPriority: newManualPriority } : t))
    );

    await fetch(`/api/todos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manualPriority: newManualPriority }),
    });
  };

  const openSearch = useCallback(() => {
    if (!searchOpen) {
      viewBeforeSearchRef.current = selectedView;
      setSearchOpen(true);
      setSelectedView(VIEW_SEARCH);
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [searchOpen, selectedView]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery("");
    setSelectedView(viewBeforeSearchRef.current);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (searchOpen) closeSearch();
        else openSearch();
      }
      if (e.key === "Escape" && searchOpen) {
        closeSearch();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [searchOpen, openSearch, closeSearch]);

  // Get view title
  const getViewTitle = () => {
    if (isSearchView) return "Search";
    if (isCompletedView) return "Completed";
    if (isRefactorView) return "Refactor Lists";
    if (isObsidianView) return "Sync Obsidian Notes";
    if (selectedList) return selectedList.name;
    return "Inbox";
  };

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSelectView = (view: string | null) => {
    setSelectedView(view);
    setSidebarOpen(false);
    if (searchOpen) {
      setSearchOpen(false);
      setSearchQuery("");
    }
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <div className={`
          fixed inset-y-0 left-0 z-40 w-64 transform transition-transform duration-200 ease-in-out
          md:relative md:translate-x-0 md:z-auto
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}>
          <Sidebar
            lists={lists}
            selectedView={selectedView}
            onSelectView={handleSelectView}
            inboxCount={inboxCount}
            completedCount={completedCount}
            highlightedListIds={highlightedListIds}
            onRefresh={fetchData}
          />
        </div>

        {/* Main Area */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Header */}
          <div className="flex-shrink-0 p-4 border-b border-border flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="md:hidden text-text-muted hover:text-accent transition-colors text-lg"
              aria-label="Toggle sidebar"
            >
              &#9776;
            </button>
            {searchOpen ? (
              <div className="flex-1 flex items-center gap-3">
                <span className="text-text-faint text-sm">&#8981;</span>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search notes..."
                  className="flex-1 bg-transparent text-text-normal placeholder:text-text-faint
                             outline-none text-base"
                  autoFocus
                />
                {searchQuery && (
                  <span className="text-xs text-text-faint whitespace-nowrap">
                    {displayedTodos.length} result{displayedTodos.length !== 1 ? "s" : ""}
                  </span>
                )}
                <button
                  onClick={closeSearch}
                  className="text-text-muted hover:text-accent transition-colors text-sm px-2 py-1"
                >
                  Esc
                </button>
              </div>
            ) : (
              <>
                <div className="flex-1">
                  <h2 className="text-xl heat-2">{getViewTitle()}</h2>
                  {selectedList && (
                    <p className="text-sm text-text-muted mt-1">{selectedList.summary}</p>
                  )}
                  {isCompletedView && (
                    <p className="text-sm text-text-muted mt-1">
                      {completedCount} completed items
                    </p>
                  )}
                </div>
                <button
                  onClick={openSearch}
                  className="flex-shrink-0 text-text-muted hover:text-accent transition-colors
                             text-sm px-2 py-1 flex items-center gap-1.5"
                  title="Search (Cmd+K)"
                >
                  <span>&#8981;</span>
                  <span className="hidden sm:inline">Search</span>
                  <kbd className="hidden md:inline text-[10px] text-text-faint border border-border px-1.5 py-0.5 ml-1">
                    &#8984;K
                  </kbd>
                </button>
              </>
            )}
            {!searchOpen && selectedView === null && (
              <div className="relative flex-shrink-0">
                <button
                  onClick={() => setShowFilterMenu(!showFilterMenu)}
                  className={`text-sm px-3 py-1.5 transition-colors ${
                    inboxFilter.listIds.length > 0
                      ? "text-accent border border-accent/30"
                      : "text-text-muted hover:text-text-normal"
                  }`}
                >
                  {inboxFilter.listIds.length > 0
                    ? `filter (${inboxFilter.listIds.length})`
                    : "filter"}
                </button>
                {showFilterMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowFilterMenu(false)}
                    />
                    {/* Desktop: dropdown. Mobile: bottom sheet */}
                    <div className="
                      fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-y-auto
                      bg-background-secondary border-t border-border
                      md:absolute md:inset-auto md:right-0 md:top-full md:mt-1
                      md:w-72 md:border md:max-h-80 md:shadow-lg md:bottom-auto
                    ">
                      <div className="p-3 border-b border-border flex items-center justify-between">
                        <div className="flex gap-2 text-xs">
                          <button
                            onClick={() => updateFilter({ ...inboxFilter, mode: "blacklist" })}
                            className={`px-2 py-1.5 ${
                              inboxFilter.mode === "blacklist"
                                ? "text-accent bg-accent/10"
                                : "text-text-muted hover:text-text-normal"
                            }`}
                          >
                            Hide selected
                          </button>
                          <button
                            onClick={() => updateFilter({ ...inboxFilter, mode: "whitelist" })}
                            className={`px-2 py-1.5 ${
                              inboxFilter.mode === "whitelist"
                                ? "text-accent bg-accent/10"
                                : "text-text-muted hover:text-text-normal"
                            }`}
                          >
                            Show only selected
                          </button>
                        </div>
                        <button
                          onClick={() => setShowFilterMenu(false)}
                          className="md:hidden text-text-muted text-lg px-2"
                        >
                          x
                        </button>
                      </div>
                      <div className="py-1">
                        {lists.map((list) => (
                          <button
                            key={list.id}
                            onClick={() => toggleListFilter(list.id)}
                            className="w-full text-left px-4 py-3 md:px-3 md:py-2 text-sm flex items-center gap-3 hover:bg-background-tertiary active:bg-background-tertiary"
                          >
                            <span className={`w-5 text-center ${
                              inboxFilter.listIds.includes(list.id) ? "text-accent" : "text-text-faint"
                            }`}>
                              {inboxFilter.listIds.includes(list.id) ? "x" : "-"}
                            </span>
                            <span className="truncate flex-1">{list.name}</span>
                            <span className="text-xs text-text-faint">
                              ({list.itemCount})
                            </span>
                          </button>
                        ))}
                      </div>
                      {inboxFilter.listIds.length > 0 && (
                        <div className="p-3 border-t border-border pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                          <button
                            onClick={() => updateFilter({ ...inboxFilter, listIds: [] })}
                            className="text-xs text-text-muted hover:text-accent w-full text-center py-1"
                          >
                            Clear filter
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Content — ObsidianSync and RefactorLists stay mounted to preserve chat state */}
          <div className={`${isObsidianView ? "flex flex-col flex-1 overflow-hidden" : "hidden"}`}>
            <ObsidianSync
              onComplete={() => { fetchData(); setSelectedView(VIEW_INBOX); }}
              onCancel={() => setSelectedView(VIEW_INBOX)}
            />
          </div>
          <div className={`${isRefactorView ? "flex flex-col flex-1 overflow-hidden" : "hidden"}`}>
            <RefactorLists
              lists={lists}
              onComplete={handleRefactorComplete}
              onCancel={() => setSelectedView(VIEW_INBOX)}
            />
          </div>
          {!isObsidianView && !isRefactorView && (
            <>
              {/* Todo List */}
              <div className="flex-1 overflow-y-auto p-4">
                {displayedTodos.length === 0 ? (
                  <div className="text-center py-12 text-text-muted">
                    <p className="text-4xl mb-4">{isSearchView ? "&#8981;" : "*"}</p>
                    <p>
                      {isSearchView
                        ? (searchQuery.trim() ? "No matching notes." : "Start typing to search...")
                        : isCompletedView
                          ? "No completed items yet."
                          : "No items yet."}
                    </p>
                    {!isCompletedView && !isSearchView && (
                      <p className="text-sm mt-2">Type something in the box below!</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3 max-w-2xl mx-auto md:mx-0">
                    {displayedTodos.map((todo) => (
                      <TodoCard
                        key={todo.id}
                        todo={todo}
                        onComplete={handleComplete}
                        onSnooze={handleSnooze}
                        onEdit={setEditingTodo}
                        onDelete={handleDelete}
                        onVote={handleVote}
                        priorityHeat={priorityHeatClass(effectivePriority(todo))}
                        showListName={
                          (selectedView === null || isCompletedView || isSearchView)
                            ? lists.find((l) => l.id === todo.listId)?.name
                            : undefined
                        }
                        isHighlighted={highlightedTodoIds.has(todo.id)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Ask About List - for timeless lists */}
              {selectedList && !selectedList.isTimeBound && (
                <div className="flex-shrink-0 p-4 border-t border-border">
                  <AskAboutList listName={selectedList.name} onAsk={handleAskAboutList} />
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Success Toast */}
      {successToast && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50
                        px-5 py-3 bg-background-tertiary border border-accent/40
                        text-accent text-sm shadow-glow
                        ${successToast.exiting ? "toast-exit" : "toast-enter"}`}>
          <span className="mr-2">&#10003;</span>
          {successToast.message}
        </div>
      )}

      {/* Magic Input - Bottom */}
      <footer className="flex-shrink-0 border-t border-border">
        <MagicInput
          onSubmit={handleMagicInput}
          isProcessing={isProcessing}
          canUndo={!!lastGeneration && lastGeneration.todoIds.length > 0}
          onUndo={handleUndo}
        />
      </footer>

      {/* Edit Modal */}
      <TodoEditor
        todo={editingTodo}
        lists={lists}
        onSave={handleSaveEdit}
        onClose={() => setEditingTodo(null)}
      />
    </div>
  );
}
