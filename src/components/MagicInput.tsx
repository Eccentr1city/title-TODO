"use client";

import { useState, useRef, useEffect } from "react";

type ModelTier = "cheap" | "medium" | "expensive";

interface MagicInputProps {
  onSubmit: (text: string, model: ModelTier) => Promise<void>;
  isProcessing: boolean;
  canUndo: boolean;
  onUndo: () => Promise<void>;
}

const MODEL_LABELS: Record<ModelTier, string> = {
  cheap: "Haiku",
  medium: "Sonnet",
  expensive: "Opus",
};

const MODEL_DESCRIPTIONS: Record<ModelTier, string> = {
  cheap: "Fast",
  medium: "Balanced",
  expensive: "Powerful",
};

const MODEL_COLORS: Record<ModelTier, string> = {
  cheap: "text-success",
  medium: "text-accent",
  expensive: "text-heat-1",
};

const MODEL_BG_COLORS: Record<ModelTier, string> = {
  cheap: "border-success/50 bg-success/10",
  medium: "border-accent/50 bg-accent/10",
  expensive: "border-heat-1/50 bg-heat-1/10",
};

// Thresholds for auto-selecting model based on input length
const LENGTH_THRESHOLDS = {
  medium: 500,   // Switch to Sonnet above 500 chars
  expensive: 2000, // Switch to Opus above 2000 chars
};

function getAutoModel(length: number): ModelTier {
  if (length >= LENGTH_THRESHOLDS.expensive) return "expensive";
  if (length >= LENGTH_THRESHOLDS.medium) return "medium";
  return "cheap";
}

export function MagicInput({ onSubmit, isProcessing, canUndo, onUndo }: MagicInputProps) {
  const [value, setValue] = useState("");
  const [selectedModel, setSelectedModel] = useState<ModelTier | "auto">("auto");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Compute effective model (resolves "auto" to actual model)
  const effectiveModel = selectedModel === "auto"
    ? getAutoModel(value.length)
    : selectedModel;

  // Auto-resize textarea with higher max for large inputs
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const maxHeight = value.length > 500 ? 400 : 200;
      textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    }
  }, [value]);

  // Close picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false);
      }
    };
    if (showModelPicker) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showModelPicker]);

  const handleSubmit = async () => {
    if (!value.trim() || isProcessing) return;
    const text = value;
    setValue("");
    await onSubmit(text, effectiveModel);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleUndo = async () => {
    if (isUndoing) return;
    setIsUndoing(true);
    try {
      await onUndo();
    } finally {
      setIsUndoing(false);
    }
  };

  const charCount = value.length;
  const showCharCount = charCount > 100;

  const modelDisplayName = selectedModel === "auto"
    ? `Auto (${MODEL_LABELS[effectiveModel]})`
    : MODEL_LABELS[effectiveModel];

  return (
    <div className="relative bg-background-secondary pb-[max(0px,calc(env(safe-area-inset-bottom)-1.25rem))]">
      {/* Progress bar */}
      {isProcessing && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-background-tertiary overflow-hidden z-10">
          <div
            className="h-full w-1/3 bg-accent"
            style={{ animation: "slideProgress 1s ease-in-out infinite" }}
          />
        </div>
      )}

      {/* Main input area — centered with max width */}
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-3 sm:py-4">
        {/* The magic box */}
        <div className="magic-glow-border p-[1px]" ref={pickerRef}>
          <div className="bg-background-primary">
            {/* Input row: model selector | textarea | send */}
            <div className="flex items-center gap-0">
              {/* Model selector - left column */}
              <div className="relative flex-shrink-0">
                <button
                  onClick={() => setShowModelPicker(!showModelPicker)}
                  className={`flex flex-col items-center justify-center px-3 sm:px-4 py-3 h-full
                             border-r border-border transition-all
                             hover:bg-background-tertiary
                             ${MODEL_COLORS[effectiveModel]}`}
                >
                  <span className="text-lg sm:text-xl">&#10022;</span>
                  <span className="text-[10px] sm:text-xs mt-1 uppercase tracking-wider whitespace-nowrap">
                    {selectedModel === "auto" ? MODEL_LABELS[effectiveModel] : modelDisplayName}
                  </span>
                </button>

                {/* Model picker - opens UPWARD */}
                {showModelPicker && (
                  <div className="absolute bottom-full left-0 mb-1 bg-background-tertiary border border-border z-50 min-w-[200px] shadow-glow">
                    <button
                      onClick={() => { setSelectedModel("auto"); setShowModelPicker(false); }}
                      className={`w-full text-left px-4 py-3 text-sm hover:bg-background-secondary transition-colors
                                 ${selectedModel === "auto" ? "text-accent bg-accent/5" : "text-text-normal"}`}
                    >
                      <span className="font-medium">Auto</span>
                      <span className="block text-xs text-text-faint mt-0.5">
                        Picks model based on input length
                        {selectedModel === "auto" && ` (currently ${MODEL_LABELS[effectiveModel]})`}
                      </span>
                    </button>
                    {(["cheap", "medium", "expensive"] as ModelTier[]).map((model) => (
                      <button
                        key={model}
                        onClick={() => { setSelectedModel(model); setShowModelPicker(false); }}
                        className={`w-full text-left px-4 py-3 text-sm hover:bg-background-secondary transition-colors
                                   ${selectedModel === model ? `${MODEL_COLORS[model]} bg-accent/5` : "text-text-normal"}`}
                      >
                        <span className="font-medium">{MODEL_LABELS[model]}</span>
                        <span className="text-text-faint"> - {MODEL_DESCRIPTIONS[model]}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Textarea - center */}
              <div className="flex-1 relative min-w-0">
                <textarea
                  suppressHydrationWarning
                  ref={textareaRef}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type anything... buy milk, watch Dune, learn Rust by Friday..."
                  disabled={isProcessing}
                  rows={1}
                  className="w-full bg-transparent text-text-normal placeholder:text-text-faint
                             resize-none outline-none min-h-[48px] leading-6 px-4 py-3
                             disabled:opacity-50 overflow-y-auto"
                  style={{ maxHeight: value.length > 500 ? "400px" : "150px" }}
                />
                {showCharCount && (
                  <span className="absolute bottom-1 right-3 text-[10px] text-text-faint">
                    {charCount.toLocaleString()}
                  </span>
                )}
              </div>

              {/* Undo button */}
              {canUndo && !isProcessing && (
                <button
                  onClick={handleUndo}
                  disabled={isUndoing}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-3 h-full
                             border-l border-border transition-all
                             text-text-muted hover:text-heat-1 hover:bg-heat-1/5
                             disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Undo last generation"
                >
                  {isUndoing ? (
                    <span className="animate-pulse text-sm">Undoing...</span>
                  ) : (
                    <>
                      <span className="text-base">&#8634;</span>
                      <span className="hidden sm:inline text-sm">Undo</span>
                    </>
                  )}
                </button>
              )}

              {/* Send button - right column */}
              <button
                onClick={handleSubmit}
                disabled={!value.trim() || isProcessing}
                className={`flex-shrink-0 flex items-center gap-2 px-4 sm:px-5 py-3 h-full
                           border-l border-border transition-all
                           disabled:opacity-30 disabled:cursor-not-allowed
                           ${isProcessing
                             ? "text-accent"
                             : "text-text-muted hover:text-accent hover:bg-background-tertiary"
                           }`}
              >
                {isProcessing ? (
                  <span className="animate-pulse text-sm sm:text-base">Processing...</span>
                ) : (
                  <>
                    <span className="text-lg">&#8629;</span>
                    <span className="hidden sm:inline text-sm">Send</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Hint for long inputs */}
        {value.length > 200 && !isProcessing && (
          <div className="hidden sm:block text-center text-[10px] text-text-faint mt-1">
            Shift+Enter for new line
          </div>
        )}
      </div>
    </div>
  );
}
