"use client";

import { useState, useRef, useEffect } from "react";

type ModelTier = "cheap" | "medium" | "expensive";

interface MagicInputProps {
  onSubmit: (text: string, model: ModelTier) => Promise<void>;
  isProcessing: boolean;
}

const MODEL_LABELS: Record<ModelTier, string> = {
  cheap: "Haiku",
  medium: "Sonnet", 
  expensive: "Opus",
};

const MODEL_COLORS: Record<ModelTier, string> = {
  cheap: "text-success",
  medium: "text-accent",
  expensive: "text-heat-1",
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

export function MagicInput({ onSubmit, isProcessing }: MagicInputProps) {
  const [value, setValue] = useState("");
  const [selectedModel, setSelectedModel] = useState<ModelTier | "auto">("auto");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const handleSubmit = async () => {
    if (!value.trim() || isProcessing) return;
    const text = value;
    setValue("");
    await onSubmit(text, effectiveModel);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Shift+Enter for newline, Enter alone to submit
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const charCount = value.length;
  const showCharCount = charCount > 100;

  return (
    <div className="relative">
      <div className="flex items-start gap-3 p-4 bg-background-secondary border border-border">
        {/* Model selector button */}
        <div className="relative">
          <button
            onClick={() => setShowModelPicker(!showModelPicker)}
            className={`text-xl mt-1 transition-colors hover:opacity-80 ${MODEL_COLORS[effectiveModel]}`}
            title={`Model: ${selectedModel === "auto" ? `Auto (${MODEL_LABELS[effectiveModel]})` : MODEL_LABELS[effectiveModel]}`}
          >
            {selectedModel === "auto" ? "\u2726" : "\u2605"}
          </button>
          
          {/* Model picker dropdown */}
          {showModelPicker && (
            <div className="absolute top-full left-0 mt-2 bg-background-tertiary border border-border z-50 min-w-[140px]">
              <button
                onClick={() => { setSelectedModel("auto"); setShowModelPicker(false); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-background-secondary transition-colors
                           ${selectedModel === "auto" ? "text-accent" : "text-text-normal"}`}
              >
                Auto {selectedModel === "auto" && `(${MODEL_LABELS[effectiveModel]})`}
              </button>
              {(["cheap", "medium", "expensive"] as ModelTier[]).map((model) => (
                <button
                  key={model}
                  onClick={() => { setSelectedModel(model); setShowModelPicker(false); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-background-secondary transition-colors
                             ${selectedModel === model ? MODEL_COLORS[model] : "text-text-normal"}`}
                >
                  {MODEL_LABELS[model]}
                  {model === "cheap" && " - fast"}
                  {model === "medium" && " - balanced"}
                  {model === "expensive" && " - powerful"}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Text input */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type anything... buy milk, watch Dune, learn Rust by Friday..."
            disabled={isProcessing}
            rows={1}
            className="w-full bg-transparent text-text-normal placeholder:text-text-faint 
                       resize-none outline-none min-h-[28px] leading-7
                       disabled:opacity-50 overflow-y-auto"
            style={{ maxHeight: value.length > 500 ? "400px" : "200px" }}
          />
          {/* Character count & model indicator for long inputs */}
          {showCharCount && (
            <div className="absolute bottom-0 right-0 text-xs text-text-faint flex items-center gap-2">
              <span className={MODEL_COLORS[effectiveModel]}>
                {MODEL_LABELS[effectiveModel]}
              </span>
              <span>{charCount.toLocaleString()} chars</span>
            </div>
          )}
        </div>

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={!value.trim() || isProcessing}
          className="incandescent-button disabled:opacity-30 disabled:cursor-not-allowed
                     flex items-center gap-2 flex-shrink-0"
        >
          {isProcessing ? (
            <>
              <span className="animate-pulse">&bull;</span>
              <span>Processing...</span>
            </>
          ) : (
            <>
              <span>&crarr;</span>
              <span>Send</span>
            </>
          )}
        </button>
      </div>

      {/* Progress bar */}
      {isProcessing && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-background-tertiary overflow-hidden">
          <div 
            className="h-full w-1/3 bg-accent"
            style={{ animation: "slideProgress 1s ease-in-out infinite" }} 
          />
        </div>
      )}

      {/* Hint for long inputs */}
      {value.length > 200 && !isProcessing && (
        <div className="px-4 py-1 text-xs text-text-faint border-t border-border bg-background-secondary">
          Shift+Enter for new line | Using {MODEL_LABELS[effectiveModel]} for this input
        </div>
      )}
    </div>
  );
}
