import "server-only"
import {
  convertToModelMessages,
  streamText,
  toUIMessageStream,
  type LanguageModel,
  type UIMessageStreamOutcome,
} from "ai"
import { and, eq } from "drizzle-orm"
import type { SessionUser } from "@/lib/auth"
import { db } from "@/lib/db/client"
import { chatsTable, messagesTable } from "@/lib/db/schema"
import type { ChatMessage, SendMessageInput } from "./contracts"
import { ChatNotFound } from "./errors"
import { toMessageRow } from "./mappers"
import { getChat } from "./queries"
import { findOwnedChat, nextPosition } from "./repo"

const INSTRUCTIONS = "You are a helpful assistant."

export async function createChat(requester: SessionUser) {
  const [chat] = await db
    .insert(chatsTable)
    .values({ userId: requester.id, title: "New chat", createdAt: new Date() })
    .returning({ id: chatsTable.id })
  return chat
}

export async function deleteChat(requester: SessionUser, chatId: string) {
  await db.transaction(async (tx) => {
    const chat = await findOwnedChat(tx, requester.id, chatId)
    if (!chat) throw new ChatNotFound(chatId)

    // messages.chatId references chats without ON DELETE CASCADE
    await tx.delete(messagesTable).where(eq(messagesTable.chatId, chat.id))
    await tx.delete(chatsTable).where(eq(chatsTable.id, chat.id))
  })
}

// The whole reply: store the user message, answer from the stored history,
// store the reply when the stream ends. `requester` is captured for the
// stream's lifetime, so nothing resolves the user after the response started.
// The adapter passes the model; the module never reads env.
export async function sendMessage(
  requester: SessionUser,
  input: SendMessageInput,
  model: LanguageModel
) {
  await saveUserMessage(requester, input) // ownership check; throws ChatNotFound

  // History comes from the db, not from the client.
  const chat = await getChat(requester, input.chatId)
  if (!chat) throw new ChatNotFound(input.chatId) // deleted in between

  const result = streamText({
    model,
    instructions: INSTRUCTIONS,
    messages: await convertToModelMessages(chat.messages),
    onError: ({ error }) => {
      console.error("[chats] generation error", error)
    },
  })

  return toUIMessageStream({
    stream: result.stream,
    originalMessages: chat.messages,
    generateMessageId: () => crypto.randomUUID(),
    onEnd: async ({ responseMessage, outcome }) => {
      // The response is already streaming: errors can't reach the client
      // any more, so log them instead of throwing.
      try {
        await saveAssistantMessage(requester, {
          chatId: chat.id,
          message: responseMessage,
          outcome,
        })
      } catch (error) {
        console.error("[chats] saving assistant message failed", error)
      }
    },
  })
}

// Role is fixed by the command, never by the caller. A retry with the same
// message id is a no-op.
export async function saveUserMessage(
  requester: SessionUser,
  input: SendMessageInput
) {
  await db.transaction(async (tx) => {
    const chat = await findOwnedChat(tx, requester.id, input.chatId)
    if (!chat) throw new ChatNotFound(input.chatId)

    const position = await nextPosition(tx, chat.id)
    await tx
      .insert(messagesTable)
      .values(toMessageRow(chat.id, input.message, position))
      .onConflictDoNothing({ target: messagesTable.id })
  })
}

// Decision (Stage 4): only completed replies are stored; aborted and failed
// ones are dropped. Upsert by id so a continuation updates the same row.
// Position is set on the first insert and never changed.
export async function saveAssistantMessage(
  requester: SessionUser,
  input: {
    chatId: string
    message: ChatMessage
    outcome: UIMessageStreamOutcome
  }
) {
  if (input.outcome.status !== "completed") return
  if (input.message.role !== "assistant") {
    throw new Error(
      `Expected an assistant message, got "${input.message.role}"`
    )
  }

  await db.transaction(async (tx) => {
    const chat = await findOwnedChat(tx, requester.id, input.chatId)
    if (!chat) throw new ChatNotFound(input.chatId)

    const position = await nextPosition(tx, chat.id)
    await tx
      .insert(messagesTable)
      .values(toMessageRow(chat.id, input.message, position))
      .onConflictDoUpdate({
        target: messagesTable.id,
        set: { parts: input.message.parts },
        setWhere: and(
          eq(messagesTable.chatId, chat.id),
          eq(messagesTable.role, "assistant")
        ),
      })
  })
}
