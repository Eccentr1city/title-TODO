import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const MODELS = {
  cheap: "claude-haiku-5-5",
  medium: "claude-sonnet-5-5",
  expensive: "claude-opus-5-5",
} as const;

export type ModelTier = keyof typeof MODELS;
export type Effort = "low" | "medium" | "high";

// All tiers think by default (default effort: Haiku/Opus "medium", Sonnet
// "high"), and thinking tokens count against max_tokens. Lower effort for
// latency-sensitive routes and leave headroom so answers don't truncate.
type CallOptions = {
  model?: ModelTier;
  system?: string;
  maxTokens?: number;
  effort?: Effort;
};

function checkStop(response: Anthropic.Message): void {
  if (response.stop_reason === "refusal") {
    throw new Error("Model declined the request (stop_reason: refusal)");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error(
      "Response hit max_tokens before finishing (thinking consumed the budget) — raise maxTokens or lower effort"
    );
  }
}

// One-shot request whose reply is constrained to `schema` (structured outputs),
// so callers get a validated object instead of scraping JSON out of prose.
export async function structured<S extends z.ZodType>(
  schema: S,
  messages: Anthropic.MessageParam[],
  options: CallOptions = {}
): Promise<z.infer<S>> {
  const { model = "cheap", system, maxTokens = 16000, effort } = options;

  const response = await anthropic.messages.parse({
    model: MODELS[model],
    max_tokens: maxTokens,
    system,
    messages,
    output_config: { format: zodOutputFormat(schema), ...(effort ? { effort } : {}) },
  });

  checkStop(response);
  if (response.parsed_output == null) {
    throw new Error("Model output didn't match the expected schema");
  }
  return response.parsed_output as z.infer<S>;
}
