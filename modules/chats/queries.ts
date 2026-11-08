import "server-only"
import { asc, desc, eq } from "drizzle-orm"
import type { SessionUser } from "@/lib/auth"
import { db } from "@/lib/db/client"
import { chatsTable, messagesTable } from "@/lib/db/schema"
import { chatIdInput } from "./contracts"
import type { ChatDetail, ChatListItem } from "./contracts"
import { toChatMessage } from "./mappers"
import { findOwnedChat } from "./repo"

export async function getChats(
  requester: SessionUser
): Promise<ChatListItem[]> {
  return db
    .select({ id: chatsTable.id, title: chatsTable.title })
    .from(chatsTable)
    .where(eq(chatsTable.userId, requester.id))
    .orderBy(desc(chatsTable.createdAt)) // Stage 2: newest first
}

// A malformed id is treated like a missing one.
export async function getChat(
  requester: SessionUser,
  chatId: string
): Promise<ChatDetail | null> {
  if (!chatIdInput.safeParse(chatId).success) return null

  const chat = await findOwnedChat(db, requester.id, chatId)
  if (!chat) return null

  const rows = await db
    .select({
      id: messagesTable.id,
      role: messagesTable.role,
      parts: messagesTable.parts,
    })
    .from(messagesTable)
    .where(eq(messagesTable.chatId, chat.id))
    .orderBy(asc(messagesTable.position))

  return {
    id: chat.id,
    title: chat.title,
    canDelete: chat.userId === requester.id,
    messages: rows.map(toChatMessage),
  }
}
