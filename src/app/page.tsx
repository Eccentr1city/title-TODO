"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MagicInput } from "@/components/MagicInput";
import { Sidebar } from "@/components/Sidebar";
import { TodoCard } from "@/components/TodoCard";
import { TodoEditor } from "@/components/TodoEditor";
import { AskAboutList } from "@/components/AskAboutList";
import { RefactorLists } from "@/components/RefactorLists";
import { ObsidianSync } from "@/components/ObsidianSync";
import { CopyMenu, FilterMenu } from "@/components/HeaderMenus";
import { useToast } from "@/components/Toast";
import type { TodoItem } from "@/lib/types";
import type { ModelTier } from "@/lib/models";
import { effectivePriority, priorityHeatClass } from "@/lib/priority";
import { registerServiceWorker, setBadge } from "@/lib/push-client";
import { isDue, useTodos, type MagicResult } from "@/lib/use-todos";
import { useInboxFilter } from "@/lib/use-inbox-filter";
import { useKeyboardInset } from "@/lib/use-keyboard-inset";
import { copyText, viewAsJson, viewAsMarkdown } from "@/lib/export";
import { describeWhen } from "@/lib/snooze";
import { isListView, VIEW, type View } from "@/lib/views";

const byPriority = (a: TodoItem, b: TodoItem) =>
  effectivePriority(b) - effectivePriority(a) || b.createdAt.localeCompare(a.createdAt);

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export default function Home() {
  const data = useTodos();
  const inbox = useInboxFilter();
  const toast = useToast();
  useKeyboardInset();

  const [view, setView] = useState<View>(VIEW.inbox);
  const [search, setSearch] = useState<string | null>(null); // null: search closed
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editing, setEditing] = useState<TodoItem | null>(null);
  const [processing, setProcessing] = useState(false);
  const [lastMagic, setLastMagic] = useState<MagicResult | null>(null);
  const [highlight, setHighlight] = useState<{ todos: Set<string>; lists: Set<string> }>({ todos: new Set(), lists: new Set() });
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);

  const { lists, todos } = data;
  const listName = useCallback((t: TodoItem) => lists.find((l) => l.id === t.listId)?.name, [lists]);
  const selectedList = isListView(view) ? lists.find((l) => l.id === view) : undefined;

  useEffect(() => { registerServiceWorker(); }, []);
  useEffect(() => { setBadge(data.dueCount); }, [data.dueCount]);

  const flash = useCallback((todoIds: string[], listIds: string[] = []) => {
    setHighlight({ todos: new Set(todoIds), lists: new Set(listIds) });
    setTimeout(() => setHighlight({ todos: new Set(), lists: new Set() }), 3000);
  }, []);

  // Show a todo (e.g. from a tapped notification): open a view that contains
  // it, then scroll to it and make it glow.
  const focusTodo = useCallback(
    (id: string) => {
      const todo = todos.find((t) => t.id === id);
      if (!todo) return;
      setSearch(null);
      setView(todo.status === "completed" ? VIEW.completed : inbox.shows(todo) ? VIEW.inbox : todo.listId);
      flash([id]);
      setScrollTarget(id);
    },
    [todos, inbox, flash]
  );

  // Deep link on launch (/?todo=<id>), and taps while the app is already open
  // (the service worker posts a message instead of reloading).
  useEffect(() => {
    if (!data.loaded) return;
    const id = new URLSearchParams(window.location.search).get("todo");
    if (id) {
      focusTodo(id);
      window.history.replaceState(null, "", "/");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.loaded]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "open-todo") {
        data.refresh().then(() => focusTodo(e.data.id));
      }
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onMessage);
  }, [data.refresh, focusTodo]);

  // ---- What the main pane shows ----
  const sections = useMemo((): { heading?: string; todos: TodoItem[] }[] => {
    if (search !== null) {
      const q = search.trim().toLowerCase();
      if (!q) return [];
      const hits = todos
        .filter((t) => t.status !== "archived")
        .filter((t) =>
          [t.title, t.content ?? "", ...(t.tags ?? []), listName(t) ?? ""].some((s) => s.toLowerCase().includes(q))
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return [{ todos: hits }];
    }
    if (view === VIEW.completed) {
      const done = todos
        .filter((t) => t.status === "completed")
        .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
      return [{ todos: done }];
    }
    const active = todos.filter((t) => t.status === "active");
    if (isListView(view)) return [{ todos: active.filter((t) => t.listId === view).sort(byPriority) }];
    const shown = active.filter(inbox.shows).sort(byPriority);
    const now = Date.now();
    const due = shown.filter((t) => isDue(t, now));
    return due.length
      ? [{ heading: "Due now", todos: due }, { heading: "Everything else", todos: shown.filter((t) => !isDue(t, now)) }]
      : [{ todos: shown }];
  }, [search, view, todos, inbox, listName]);

  const visible = sections.flatMap((s) => s.todos);
  const title =
    search !== null ? "Search"
    : view === VIEW.completed ? "Completed"
    : view === VIEW.refactor ? "Refactor Lists"
    : view === VIEW.obsidian ? "Sync Obsidian Notes"
    : selectedList?.name ?? "Inbox";
  const isTool = search === null && (view === VIEW.refactor || view === VIEW.obsidian);

  // Scroll once the target is rendered in the view focusTodo switched to
  useEffect(() => {
    if (!scrollTarget) return;
    const el = document.getElementById(`todo-${scrollTarget}`);
    if (!el) return;
    requestAnimationFrame(() => el.scrollIntoView({ block: "center" }));
    setScrollTarget(null);
  }, [scrollTarget, sections]);

  // ---- Actions ----
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (err) {
      toast.show(errorText(err), { tone: "error" });
    }
  };

  const complete = (todo: TodoItem) =>
    run(async () => {
      const updated = await data.toggleComplete(todo);
      if (todo.status === "completed") return;
      if (updated.status === "active" && updated.nextReminder) {
        toast.show(`Done — repeats ${updated.reminderCadence}, next ${describeWhen(new Date(updated.nextReminder))}`);
      } else {
        toast.show(`Completed "${todo.title}"`, { action: { label: "Undo", run: () => run(() => data.toggleComplete(updated)) } });
      }
    });

  const snooze = (todo: TodoItem, until: Date) =>
    run(async () => {
      await data.snooze(todo.id, until);
      toast.show(`Snoozed until ${describeWhen(until)}`);
    });

  const remove = (todo: TodoItem) =>
    run(async () => {
      const restore = await data.trash(todo);
      toast.show(`Deleted "${todo.title}"`, { action: { label: "Undo", run: () => run(restore) } });
    });

  const submitMagic = async (text: string, model: ModelTier): Promise<boolean> => {
    setProcessing(true);
    try {
      const result = await data.magic(text, model);
      setLastMagic(result);
      const listIds = [...new Set(result.todos.map((t) => t.listId))];
      const names = listIds.map((id) => lists.find((l) => l.id === id)?.name ?? result.lists.find((l) => l.id === id)?.name);
      const where = names.length <= 2 ? names.join(" & ") : `${names.length} lists`;
      const created = `${result.todos.length} ${result.todos.length === 1 ? "item" : "items"}`;
      const newLists = result.lists.length ? `, ${result.lists.length} new ${result.lists.length === 1 ? "list" : "lists"}` : "";
      toast.show(result.todos.length ? `${created} in ${where}${newLists}` : "Nothing to add");
      flash(result.todos.map((t) => t.id), listIds);
      return true;
    } catch (err) {
      toast.show(`Couldn't add that: ${errorText(err)}`, { tone: "error" });
      return false;
    } finally {
      setProcessing(false);
    }
  };

  const undoMagic = () =>
    run(async () => {
      if (!lastMagic) return;
      await data.undoMagic(lastMagic);
      setLastMagic(null);
    });

  const selectView = (v: View) => {
    setView(v);
    setSearch(null);
    setSidebarOpen(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearch((s) => (s === null ? "" : null));
      } else if (e.key === "Escape" && search !== null && !editing) {
        setSearch(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [search, editing]);

  const exportView = { title, summary: selectedList?.summary, sections, listName: (t: TodoItem) => (selectedList ? undefined : listName(t)) };

  return (
    <div className="app-shell flex flex-col pt-[env(safe-area-inset-top)]">
      <div className="flex-1 flex overflow-hidden relative">
        {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />}

        <div
          className={`fixed inset-y-0 left-0 z-40 w-64 transform transition-transform duration-200 ease-in-out
                      pt-[env(safe-area-inset-top)] bg-background-secondary md:pt-0 md:relative md:translate-x-0 md:z-auto
                      ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <Sidebar
            lists={lists}
            selectedView={search !== null ? VIEW.search : view}
            onSelectView={selectView}
            inboxCount={todos.filter((t) => t.status === "active" && inbox.shows(t)).length}
            completedCount={todos.filter((t) => t.status === "completed").length}
            highlightedListIds={highlight.lists}
            onRefresh={data.refresh}
          />
        </div>

        <main className="relative flex-1 flex flex-col overflow-hidden min-w-0">
          <header className="flex-shrink-0 px-4 py-3 border-b border-border flex items-center gap-3 min-h-[60px]">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="md:hidden text-text-muted hover:text-accent text-lg"
              aria-label="Toggle sidebar"
            >
              &#9776;
            </button>
            {search !== null ? (
              <>
                <span className="text-text-faint text-sm">&#8981;</span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="flex-1 min-w-0 bg-transparent placeholder:text-text-faint outline-none text-base"
                  autoFocus
                />
                {search && <span className="text-xs text-text-faint whitespace-nowrap">{visible.length} found</span>}
                <button onClick={() => setSearch(null)} className="text-text-muted hover:text-accent text-sm px-2 py-1">
                  Close
                </button>
              </>
            ) : (
              <>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl heat-2 truncate">{title}</h2>
                  {selectedList?.summary && <p className="text-sm text-text-muted mt-0.5 truncate">{selectedList.summary}</p>}
                </div>
                {!isTool && (
                  <>
                    <button onClick={() => setSearch("")} className="text-text-muted hover:text-accent text-sm px-2 py-1.5" title="Search (⌘K)">
                      &#8981;<span className="hidden sm:inline ml-1.5">Search</span>
                    </button>
                    {visible.length > 0 && (
                      <CopyMenu onCopy={(f) => copyText(f === "markdown" ? viewAsMarkdown(exportView) : viewAsJson(exportView))} />
                    )}
                    {view === VIEW.inbox && <FilterMenu lists={lists} inbox={inbox} />}
                  </>
                )}
              </>
            )}
          </header>

          {/* The tools stay mounted so their conversations survive switching views */}
          <div className={view === VIEW.obsidian && search === null ? "flex flex-col flex-1 min-h-0" : "hidden"}>
            <ObsidianSync onApplied={data.refresh} onDone={() => selectView(VIEW.inbox)} />
          </div>
          <div className={view === VIEW.refactor && search === null ? "flex flex-col flex-1 min-h-0" : "hidden"}>
            <RefactorLists lists={lists} onApplied={data.refresh} onDone={() => selectView(VIEW.inbox)} />
          </div>

          {!isTool && (
            <>
              <div className="flex-1 overflow-y-auto p-4">
                {visible.length === 0 ? (
                  <div className="text-center py-12 text-text-muted">
                    {!data.loaded
                      ? <p className="animate-pulse">Loading…</p>
                      : search !== null
                        ? <p>{search.trim() ? "Nothing matches." : "Type to search everything."}</p>
                        : view === VIEW.completed
                          ? <p>Nothing completed yet.</p>
                          : <p>All clear. Type anything below to add to it.</p>}
                  </div>
                ) : (
                  <div className="space-y-3 max-w-2xl mx-auto md:mx-0">
                    {sections.map((section, i) => (
                      <div key={section.heading ?? i} className="space-y-3">
                        {section.heading && (
                          <div className={`text-xs uppercase tracking-widest pt-1 ${i === 0 ? "text-error" : "text-text-faint pt-3"}`}>
                            {i === 0 ? "! " : ""}{section.heading}
                          </div>
                        )}
                        {section.todos.map((todo) => (
                          <TodoCard
                            key={todo.id}
                            todo={todo}
                            onComplete={complete}
                            onSnooze={snooze}
                            onEdit={setEditing}
                            onDelete={remove}
                            onVote={search === null && view !== VIEW.completed ? (t, dir) => run(() => data.vote(t, dir, visible)) : undefined}
                            priorityHeat={priorityHeatClass(effectivePriority(todo))}
                            listName={selectedList ? undefined : listName(todo)}
                            highlighted={highlight.todos.has(todo.id)}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedList && search === null && (
                <div className="flex-shrink-0 px-4 py-3 border-t border-border">
                  <AskAboutList key={selectedList.id} listId={selectedList.id} listName={selectedList.name} />
                </div>
              )}
            </>
          )}
          {toast.view}
        </main>
      </div>

      {/* The tools have their own chat input */}
      {!isTool && (
        <footer className="flex-shrink-0 border-t border-border">
          <MagicInput onSubmit={submitMagic} isProcessing={processing} canUndo={!!lastMagic?.todos.length} onUndo={undoMagic} />
        </footer>
      )}

      <TodoEditor
        todo={editing}
        lists={lists}
        onSave={(id, updates) => run(() => data.save(id, updates))}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
