import "server-only"
import { chatModel, describeAiError } from "@/lib/ai"
import * as chats from "@/modules/chats"
import { createUIMessageStreamResponse } from "ai"
import { invalidRequest, thrownResponse } from "./refusals"

// Allow streaming responses up to 30 seconds
export const maxDuration = 30

// Adapter: parse → module → stream. The module binds the user (ADR 0001) and
// decides what is stored; this file speaks HTTP.
//
// Errors reach the client two ways:
// - before the stream starts: an HTTP status with `{ error }` (refusals.ts);
// - after it started: an error chunk whose text comes from describeAiError.
export async function POST(req: Request) {
  // The body can be read once; parse this value, don't call req.json() again.
  const body = await req.json().catch(() => null)
  const parsed = chats.chatRequestInput.safeParse(body)
  if (!parsed.success) {
    return invalidRequest()
  }

  const options = { model: chatModel(), describeError: describeAiError }
  try {
    const stream =
      parsed.data.type === "message"
        ? await chats.sendMessage(parsed.data, options)
        : await chats.continueAfterToolOutputs(parsed.data, options)
    return createUIMessageStreamResponse({ stream })
  } catch (error) {
    return thrownResponse(error)
  }
}
