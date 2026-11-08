import "server-only"
import { env } from "@/lib/env"
import * as chats from "@/modules/chats"
import { createUIMessageStreamResponse } from "ai"
import { notFound } from "next/navigation"

// Allow streaming responses up to 30 seconds
export const maxDuration = 30

// Adapter: parse → module → stream. The module binds the user (ADR 0001) and
// decides what is stored; this file only speaks HTTP.
export async function POST(req: Request) {
  const parsed = chats.sendMessageInput.safeParse(
    await req.json().catch(() => null)
  )
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 })
  }

  // The ownership check runs inside sendMessage, before streaming starts:
  // this is the last point where a 404 can still reach the client.
  try {
    const stream = await chats.sendMessage(parsed.data, env.AI_GATEWAY_MODEL)
    return createUIMessageStreamResponse({ stream })
  } catch (error) {
    if (error instanceof chats.ChatNotFound) notFound()
    throw error
  }
}
