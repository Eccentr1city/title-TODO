// Model tiers as the UI presents them (the server maps tiers to model IDs).
export type ModelTier = "cheap" | "medium" | "expensive";

export const MODEL_LABELS: Record<ModelTier, string> = {
  cheap: "Haiku",
  medium: "Sonnet",
  expensive: "Opus",
};
