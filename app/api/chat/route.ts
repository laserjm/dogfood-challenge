import "server-only"
import { chatModel, classifyAiError, type AiErrorKind } from "@/lib/ai"
import { errorResponse } from "@/lib/http"
import * as chats from "@/modules/chats"
import { createUIMessageStreamResponse } from "ai"

// Allow streaming responses up to 30 seconds
export const maxDuration = 30

// Adapter: parse → module → stream. The module binds the user (ADR 0001) and
// decides what is stored; this file speaks HTTP and owns every word users see.
//
// Errors reach the client two ways:
// - before the stream starts: an HTTP status with `{ error }` (lib/http.ts);
// - after it started: an error chunk. lib/ai names the error, this file words it.

// Single-user local app: naming the env variable is the actionable hint.
const AI_ERROR_COPY: Record<AiErrorKind, string> = {
  auth: "The AI service rejected the API key. Check AI_GATEWAY_API_KEY in .env.local and restart the server.",
  "model-not-found":
    "The configured AI model doesn't exist. Check AI_GATEWAY_MODEL in .env.local.",
  "rate-limit":
    "The AI service is busy right now. Wait a moment and try again.",
  unknown: "The assistant couldn't answer. Try again in a moment.",
}

export async function POST(req: Request) {
  const parsed = chats.sendMessageInput.safeParse(
    await req.json().catch(() => null)
  )
  if (!parsed.success) {
    return errorResponse(
      400,
      "That message couldn't be sent. Reload the page and try again."
    )
  }

  try {
    const stream = await chats.sendMessage(parsed.data, {
      model: chatModel(),
      describeError: (error) => AI_ERROR_COPY[classifyAiError(error)],
    })
    return createUIMessageStreamResponse({ stream })
  } catch (error) {
    if (error instanceof chats.ChatNotFound) {
      return errorResponse(404, "This chat doesn't exist anymore.")
    }
    console.error("[api/chat] request failed", error)
    return errorResponse(
      500,
      "Something went wrong on the server. Try again in a moment."
    )
  }
}
