import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const MODELS = {
  cheap: "claude-haiku-4-5",
  medium: "claude-sonnet-5",
  expensive: "claude-opus-5",
} as const;

export type ModelTier = keyof typeof MODELS;

export async function chat(
  messages: Anthropic.MessageParam[],
  options: {
    model?: ModelTier;
    system?: string;
    maxTokens?: number;
    // Sonnet 5 / Opus 5 think by default at effort "high", which can burn the
    // whole token budget on thinking for large contexts. Lower effort for
    // latency-sensitive routes. Not supported on Haiku (cheap) — omitted there.
    effort?: "low" | "medium" | "high";
  } = {}
) {
  // Sonnet 5 / Opus 5 think by default, and thinking tokens count against
  // max_tokens — keep headroom so answers don't truncate.
  const { model = "cheap", system, maxTokens = 4096, effort } = options;

  const response = await anthropic.messages.create({
    model: MODELS[model],
    max_tokens: maxTokens,
    system: system,
    messages: messages,
    ...(effort && model !== "cheap" ? { output_config: { effort } } : {}),
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Model declined the request (stop_reason: refusal)");
  }

  const textBlock = response.content.find((block) => block.type === "text");
  const text = textBlock?.type === "text" ? textBlock.text : "";

  // Thinking counts against max_tokens; if the budget ran out before any
  // visible text was produced, fail loudly instead of returning "".
  if (!text && response.stop_reason === "max_tokens") {
    throw new Error(
      "Response hit max_tokens before producing text (thinking consumed the budget) — raise maxTokens or lower effort"
    );
  }

  return text;
}


