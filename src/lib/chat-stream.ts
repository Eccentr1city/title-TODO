import Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODELS, ModelTier } from "./anthropic";

// Shared backend for all conversational LLM routes (ask, refactor chat,
// obsidian plan/manual). Streams raw text chunks so the client can render
// incrementally, and — because streaming has no HTTP-timeout ceiling — allows
// very large output budgets (obsidian imports can be gigantic).
export function streamChatResponse(opts: {
  model?: ModelTier;
  system?: string;
  messages: Anthropic.MessageParam[];
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
  // Emitted to the client before any model output (e.g. warnings about
  // missing files) so routes don't need a separate JSON side-channel.
  prefix?: string;
}): Response {
  const { model = "medium", system, messages, maxTokens = 64000, effort, prefix } = opts;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (prefix) controller.enqueue(encoder.encode(prefix));
        const s = anthropic.messages.stream({
          model: MODELS[model],
          max_tokens: maxTokens,
          system,
          messages,
          ...(effort && model !== "cheap" ? { output_config: { effort } } : {}),
        });

        s.on("text", (delta) => controller.enqueue(encoder.encode(delta)));

        const final = await s.finalMessage();
        if (final.stop_reason === "refusal") {
          controller.enqueue(encoder.encode("\n\n[Model declined the request]"));
        } else if (final.stop_reason === "max_tokens") {
          controller.enqueue(encoder.encode("\n\n[Response truncated: hit max_tokens]"));
        }
      } catch (err) {
        console.error("Chat stream error:", err);
        controller.enqueue(encoder.encode(`\n\n[Error: ${err instanceof Error ? err.message : String(err)}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-cache",
    },
  });
}
