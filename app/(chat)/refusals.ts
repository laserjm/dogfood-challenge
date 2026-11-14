import "server-only"
import * as chats from "@/modules/chats"

// How the chat actions answer what a use case threw (CONVENTIONS.md, Errors).
// actions.ts parses, calls the module and hands what it threw to chatRefusal.
// The `switch` ends in a `never` check, so a new error class fails to compile
// here until it has an answer; anything that is not the module's is rethrown
// as a bug. Plain functions without next/*, so refusals.test.ts checks them.

// `"notFound"`: the action calls notFound(). Its forms sit on pages that
// render server state, so a missing chat replaces the page.
export type ChatRefusal = "notFound"

export function chatRefusal(error: unknown): ChatRefusal {
  if (!chats.isChatError(error)) throw error
  switch (error.name) {
    case "ChatNotFound":
      return "notFound"
    // Only the chat route's continue call throws this; no action does.
    case "ToolOutputRejected":
      throw error
    default:
      return unmapped(error)
  }
}

// The compiler's half of the `switch`: reached only by a class with no case.
function unmapped(error: never): never {
  throw error
}
