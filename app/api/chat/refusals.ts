import "server-only"
import * as chats from "@/modules/chats"

// How the chat route answers before its stream starts: a status with
// `{ error }` (CONVENTIONS.md, Errors). chatRefusal maps every chats error
// with a `switch` that ends in a `never` check, so a new error class fails to
// compile here until it has a status; what is not the module's is rethrown.
// thrownResponse adds the bug, logged. Once the stream has started, the error
// chunk's text comes from describeAiError instead.

export function errorResponse(status: number, error: string): Response {
  return Response.json({ error } satisfies chats.ChatErrorResponse, { status })
}

export function invalidRequest(): Response {
  return errorResponse(
    400,
    "That message couldn't be sent. Reload the page and try again."
  )
}

export function chatRefusal(error: unknown): Response {
  if (!chats.isChatError(error)) throw error
  switch (error.name) {
    case "ChatNotFound":
      return errorResponse(404, "This chat doesn't exist anymore.")
    case "ToolOutputRejected":
      return errorResponse(
        409,
        "This chat changed in the meantime. Reload the page and try again."
      )
    default:
      return unmapped(error)
  }
}

// What a use case threw: a chats refusal, or a bug, logged.
export function thrownResponse(error: unknown): Response {
  if (chats.isChatError(error)) return chatRefusal(error)
  console.error("[api/chat] request failed", error)
  return errorResponse(
    500,
    "Something went wrong on the server. Try again in a moment."
  )
}

// The compiler's half of the `switch`: reached only by a class with no case.
function unmapped(error: never): never {
  throw error
}
