"use client";

import { useState } from "react";

interface AskAboutListProps {
  listName: string;
  onAsk: (question: string, onUpdate?: (text: string) => void) => Promise<string>;
}

export function AskAboutList({ listName, onAsk }: AskAboutListProps) {
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleAsk = async () => {
    if (!question.trim() || isLoading) return;
    
    setIsLoading(true);
    setResponse(null);
    
    try {
      const answer = await onAsk(question, (partial) => setResponse(partial));
      setResponse(answer);
    } catch (error) {
      setResponse("Sorry, something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="border border-border bg-background-secondary p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-accent">[?]</span>
        <span className="text-sm text-text-muted">Ask about &quot;{listName}&quot;</span>
      </div>
      
      <div className="flex gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAsk()}
          placeholder="e.g., suggest a movie for a rainy evening..."
          className="flex-1 incandescent-input px-3 py-2 text-sm"
          disabled={isLoading}
        />
        <button
          onClick={handleAsk}
          disabled={!question.trim() || isLoading}
          className="incandescent-button text-sm disabled:opacity-30"
        >
          {isLoading ? "..." : "Ask"}
        </button>
      </div>

      {response && (
        <div className="mt-4 p-3 bg-background-tertiary border border-border text-sm text-text-normal animate-fade-in">
          {response}
        </div>
      )}
    </div>
  );
}

