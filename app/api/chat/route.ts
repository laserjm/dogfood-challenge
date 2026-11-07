import "server-only"
import { requireUser } from "@/lib/auth"
import { env } from "@/lib/env"
import * as chats from "@/modules/chats"
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
} from "ai"
import { notFound } from "next/navigation"

// Allow streaming responses up to 30 seconds
export const maxDuration = 30

// Adapter: requireUser() → parse → module command → stream → module command.
export async function POST(req: Request) {
  const user = await requireUser()

  const parsed = chats.sendMessageInput.safeParse(
    await req.json().catch(() => null)
  )
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 })
  }
  const { chatId } = parsed.data

  // The ownership check runs here, before streaming starts: this is the last
  // point where a 404 can still reach the client.
  try {
    await chats.saveUserMessage(user, parsed.data)
  } catch (error) {
    if (error instanceof chats.ChatNotFound) notFound()
    throw error
  }

  // History comes from the db, not from the client.
  const chat = await chats.getChat(user, chatId)
  if (!chat) notFound()

  const result = streamText({
    model: env.AI_GATEWAY_MODEL,
    instructions: "You are a helpful assistant.",
    messages: await convertToModelMessages(chat.messages),
    onError: ({ error }) => {
      console.error("[server] generation error", error)
    },
  })

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: chat.messages,
      generateMessageId: () => crypto.randomUUID(),
      onEnd: async ({ responseMessage, outcome }) => {
        // Decision (record it in CHALLENGE_LOG for Stage 4): only completed
        // replies are stored; aborted or failed ones are dropped.
        if (outcome.status !== "completed") return

        // The response is already streaming: errors can't reach the client
        // any more, so log them instead of throwing.
        try {
          await chats.saveAssistantMessage(user, {
            chatId,
            message: responseMessage,
          })
        } catch (error) {
          console.error("[server] saving assistant message failed", error)
        }
      },
    }),
  })
}
