import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { streamChatResponse } from "@/lib/chat-stream";
import { refactorPrompt } from "@/lib/refactor";

export async function POST(request: NextRequest) {
  const { messages } = (await request.json()) as { messages: Anthropic.MessageParam[] };
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages is required" }, { status: 400 });
  }

  return streamChatResponse({
    model: "medium",
    system: refactorPrompt("refactor-chat.txt"),
    messages,
    maxTokens: 64000,
    effort: "medium",
  });
}
