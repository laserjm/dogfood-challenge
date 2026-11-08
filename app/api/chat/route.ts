import "server-only"
import { chatModel, describeAiError } from "@/lib/ai"
import * as chats from "@/modules/chats"
import { createUIMessageStreamResponse } from "ai"

// Allow streaming responses up to 30 seconds
export const maxDuration = 30

// Adapter: parse → module → stream. The module binds the user (ADR 0001) and
// decides what is stored; this file speaks HTTP and owns the copy users see.
//
// Errors reach the client two ways:
// - before the stream starts: an HTTP status with `{ error }` (below);
// - after it started: an error chunk whose text comes from describeAiError.
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
      describeError: describeAiError,
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

function errorResponse(status: number, error: string) {
  return Response.json({ error } satisfies chats.ChatErrorResponse, { status })
}
