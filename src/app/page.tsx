"use client";

import { useState, useEffect, useCallback } from "react";
import { MagicInput } from "@/components/MagicInput";
import { Sidebar } from "@/components/Sidebar";
import { TodoCard } from "@/components/TodoCard";
import { TodoEditor } from "@/components/TodoEditor";
import { AskAboutList } from "@/components/AskAboutList";
import { RefactorLists } from "@/components/RefactorLists";
import { TodoItem, TodoList } from "@/lib/types";

// Special view IDs
const VIEW_INBOX = null;
const VIEW_COMPLETED = "__completed__";
const VIEW_REFACTOR = "__refactor__";

export default function Home() {
  const [lists, setLists] = useState<TodoList[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [completedTodos, setCompletedTodos] = useState<TodoItem[]>([]);
  const [selectedView, setSelectedView] = useState<string | null>(VIEW_INBOX);
  const [isProcessing, setIsProcessing] = useState(false);
  const [editingTodo, setEditingTodo] = useState<TodoItem | null>(null);

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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (selectedView === VIEW_COMPLETED) {
      fetchCompleted();
    }
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
        // Update list item counts
        setLists((prev) =>
          prev.map((list) => {
            const newItems = data.todos.filter((t: TodoItem) => t.listId === list.id);
            return newItems.length > 0
              ? { ...list, itemCount: list.itemCount + newItems.length }
              : list;
          })
        );
      }
    } catch (error) {
      console.error("Magic input error:", error);
    } finally {
      setIsProcessing(false);
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
  const isCompletedView = selectedView === VIEW_COMPLETED;
  const isRefactorView = selectedView === VIEW_REFACTOR;
  const isListView = selectedView && !selectedView.startsWith("__");
  const selectedList = isListView ? lists.find((l) => l.id === selectedView) : null;

  // Filter and sort todos
  const displayedTodos = isCompletedView
    ? completedTodos.sort((a, b) => {
        // Sort by completedAt (most recent first)
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
          // Inbox: show all active todos
          return todo.status === "active";
        })
        .sort((a, b) => {
          // Sort by next reminder (soonest first), nulls last
          if (!a.nextReminder && !b.nextReminder) {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          }
          if (!a.nextReminder) return 1;
          if (!b.nextReminder) return -1;
          return new Date(a.nextReminder).getTime() - new Date(b.nextReminder).getTime();
        });

  const inboxCount = todos.filter((t) => t.status === "active").length;
  const completedCount = completedTodos.length;

  // Get view title
  const getViewTitle = () => {
    if (isCompletedView) return "Completed";
    if (isRefactorView) return "Refactor Lists";
    if (selectedList) return selectedList.name;
    return "Inbox";
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Magic Input - Top */}
      <header className="flex-shrink-0 border-b border-border">
        <MagicInput onSubmit={handleMagicInput} isProcessing={isProcessing} />
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          lists={lists}
          selectedView={selectedView}
          onSelectView={setSelectedView}
          inboxCount={inboxCount}
          completedCount={completedCount}
        />

        {/* Main Area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex-shrink-0 p-4 border-b border-border">
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

          {/* Content */}
          {isRefactorView ? (
            <RefactorLists 
              lists={lists} 
              onComplete={handleRefactorComplete}
              onCancel={() => setSelectedView(VIEW_INBOX)}
            />
          ) : (
            <>
              {/* Todo List */}
              <div className="flex-1 overflow-y-auto p-4">
                {displayedTodos.length === 0 ? (
                  <div className="text-center py-12 text-text-muted">
                    <p className="text-4xl mb-4">*</p>
                    <p>{isCompletedView ? "No completed items yet." : "No items yet."}</p>
                    {!isCompletedView && (
                      <p className="text-sm mt-2">Type something in the magic box above!</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3 max-w-2xl">
                    {displayedTodos.map((todo) => (
                      <TodoCard
                        key={todo.id}
                        todo={todo}
                        onComplete={handleComplete}
                        onSnooze={handleSnooze}
                        onEdit={setEditingTodo}
                        onDelete={handleDelete}
                        showListName={
                          (selectedView === null || isCompletedView)
                            ? lists.find((l) => l.id === todo.listId)?.name
                            : undefined
                        }
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
