"use client";

import { useState } from "react";
import { TodoList } from "@/lib/types";

interface RefactorListsProps {
  lists: TodoList[];
  onComplete: () => void;
  onCancel: () => void;
}

interface RefactorSuggestion {
  action: "merge" | "rename" | "split" | "retag" | "delete";
  listIds: string[];
  newName?: string;
  newSummary?: string;
  newTags?: string[];
  reason: string;
}

interface RefactorResponse {
  suggestions: RefactorSuggestion[];
  summary: string;
}

export function RefactorLists({ lists, onComplete, onCancel }: RefactorListsProps) {
  const [selectedListIds, setSelectedListIds] = useState<Set<string>>(new Set());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [suggestions, setSuggestions] = useState<RefactorResponse | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [appliedIndices, setAppliedIndices] = useState<Set<number>>(new Set());

  const toggleList = (id: string) => {
    const newSet = new Set(selectedListIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedListIds(newSet);
  };

  const selectAll = () => {
    setSelectedListIds(new Set(lists.map((l) => l.id)));
  };

  const selectNone = () => {
    setSelectedListIds(new Set());
  };

  const analyze = async () => {
    if (selectedListIds.size === 0) return;

    setIsAnalyzing(true);
    setSuggestions(null);

    try {
      const res = await fetch("/api/refactor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listIds: Array.from(selectedListIds),
        }),
      });

      if (!res.ok) throw new Error("Failed to analyze");

      const data = await res.json();
      setSuggestions(data);
    } catch (error) {
      console.error("Refactor analysis error:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const applySuggestion = async (index: number) => {
    if (!suggestions) return;
    const suggestion = suggestions.suggestions[index];

    setIsApplying(true);

    try {
      const res = await fetch("/api/refactor/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestion }),
      });

      if (res.ok) {
        setAppliedIndices((prev) => new Set([...prev, index]));
      }
    } catch (error) {
      console.error("Apply suggestion error:", error);
    } finally {
      setIsApplying(false);
    }
  };

  const getActionLabel = (action: RefactorSuggestion["action"]) => {
    switch (action) {
      case "merge": return "Merge";
      case "rename": return "Rename";
      case "split": return "Split";
      case "retag": return "Retag";
      case "delete": return "Delete";
    }
  };

  const getActionColor = (action: RefactorSuggestion["action"]) => {
    switch (action) {
      case "merge": return "text-accent";
      case "rename": return "text-heat-2";
      case "split": return "text-heat-4";
      case "retag": return "text-success";
      case "delete": return "text-error";
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-2xl">
        {/* Selection phase */}
        {!suggestions && (
          <>
            <p className="text-text-muted mb-4">
              Select lists to analyze for potential reorganization. Opus will suggest 
              ways to merge similar lists, rename for clarity, or restructure your organization.
            </p>

            {/* Quick select buttons */}
            <div className="flex gap-2 mb-4">
              <button onClick={selectAll} className="incandescent-button text-sm py-1">
                Select All
              </button>
              <button onClick={selectNone} className="incandescent-button text-sm py-1">
                Select None
              </button>
            </div>

            {/* List checkboxes */}
            <div className="space-y-2 mb-6">
              {lists.map((list) => (
                <label
                  key={list.id}
                  className={`flex items-start gap-3 p-3 cursor-pointer transition-all
                             ${selectedListIds.has(list.id) 
                               ? "bg-background-tertiary border border-accent" 
                               : "bg-background-secondary border border-border hover:border-border-hover"}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedListIds.has(list.id)}
                    onChange={() => toggleList(list.id)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{list.name}</span>
                      <span className="text-xs text-text-faint">
                        ({list.itemCount} items)
                      </span>
                      {list.tags.length > 0 && (
                        <span className="text-xs text-text-muted">
                          #{list.tags.join(" #")}
                        </span>
                      )}
                    </div>
                    {list.summary && (
                      <p className="text-sm text-text-muted mt-1 truncate">
                        {list.summary}
                      </p>
                    )}
                  </div>
                </label>
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={analyze}
                disabled={selectedListIds.size === 0 || isAnalyzing}
                className="incandescent-button bg-accent/20 border-accent text-accent
                           disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {isAnalyzing ? "Analyzing with Opus..." : `Analyze ${selectedListIds.size} Lists`}
              </button>
              <button onClick={onCancel} className="incandescent-button">
                Cancel
              </button>
            </div>
          </>
        )}

        {/* Results phase */}
        {suggestions && (
          <>
            <div className="mb-6 p-4 bg-background-tertiary border border-border">
              <h3 className="text-lg heat-2 mb-2">Analysis Summary</h3>
              <p className="text-text-muted">{suggestions.summary}</p>
            </div>

            {suggestions.suggestions.length === 0 ? (
              <p className="text-text-muted">
                No reorganization suggestions. Your lists look well-organized!
              </p>
            ) : (
              <div className="space-y-4 mb-6">
                {suggestions.suggestions.map((suggestion, index) => {
                  const isApplied = appliedIndices.has(index);
                  const listNames = suggestion.listIds
                    .map((id) => lists.find((l) => l.id === id)?.name)
                    .filter(Boolean)
                    .join(", ");

                  return (
                    <div
                      key={index}
                      className={`p-4 border transition-all
                                 ${isApplied 
                                   ? "bg-success/10 border-success/30 opacity-60" 
                                   : "bg-background-secondary border-border"}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`font-medium ${getActionColor(suggestion.action)}`}>
                              {getActionLabel(suggestion.action)}
                            </span>
                            <span className="text-text-muted">
                              {listNames}
                            </span>
                          </div>
                          {suggestion.newName && (
                            <p className="text-sm text-accent">
                              &rarr; {suggestion.newName}
                            </p>
                          )}
                          <p className="text-sm text-text-muted mt-2">
                            {suggestion.reason}
                          </p>
                        </div>
                        <button
                          onClick={() => applySuggestion(index)}
                          disabled={isApplied || isApplying}
                          className="incandescent-button text-sm py-1 flex-shrink-0
                                     disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          {isApplied ? "Applied" : "Apply"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Done buttons */}
            <div className="flex gap-2">
              <button
                onClick={onComplete}
                className="incandescent-button bg-accent/20 border-accent text-accent"
              >
                Done
              </button>
              <button
                onClick={() => {
                  setSuggestions(null);
                  setAppliedIndices(new Set());
                }}
                className="incandescent-button"
              >
                Analyze Again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


