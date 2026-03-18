import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const MODELS = {
  cheap: "claude-haiku-4-5-20251001",
  medium: "claude-sonnet-4-6",
  expensive: "claude-opus-4-6",
} as const;

export type ModelTier = keyof typeof MODELS;

export async function chat(
  messages: Anthropic.MessageParam[],
  options: {
    model?: ModelTier;
    system?: string;
    maxTokens?: number;
  } = {}
) {
  const { model = "cheap", system, maxTokens = 1024 } = options;

  const response = await anthropic.messages.create({
    model: MODELS[model],
    max_tokens: maxTokens,
    system: system,
    messages: messages,
  });

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock?.type === "text" ? textBlock.text : "";
}


