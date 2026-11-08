import "server-only"
import { and, eq } from "drizzle-orm"
import type { SessionUser } from "@/lib/auth"
import { db } from "@/lib/db/client"
import { chatsTable, messagesTable } from "@/lib/db/schema"
import { chatIdInput } from "./contracts"
import type { ChatMessage, SendMessageInput } from "./contracts"
import { ChatNotFound } from "./errors"
import { toMessageRow } from "./mappers"
import { findOwnedChat, nextPosition } from "./repo"

export async function createChat(requester: SessionUser) {
  const [chat] = await db
    .insert(chatsTable)
    .values({ userId: requester.id, title: "New chat", createdAt: new Date() })
    .returning({ id: chatsTable.id })
  return chat
}

// A malformed id is treated like a missing one.
export async function deleteChat(requester: SessionUser, chatId: string) {
  if (!chatIdInput.safeParse(chatId).success) throw new ChatNotFound(chatId)

  await db.transaction(async (tx) => {
    const chat = await findOwnedChat(tx, requester.id, chatId)
    if (!chat) throw new ChatNotFound(chatId)

    // messages.chatId references chats without ON DELETE CASCADE
    await tx.delete(messagesTable).where(eq(messagesTable.chatId, chat.id))
    await tx.delete(chatsTable).where(eq(chatsTable.id, chat.id))
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

// Upsert by id so a continuation updates the same row. Position is set on
// the first insert and never changed.
export async function saveAssistantMessage(
  requester: SessionUser,
  input: { chatId: string; message: ChatMessage }
) {
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
