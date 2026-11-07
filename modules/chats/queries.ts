import "server-only"
import { asc, desc, eq } from "drizzle-orm"
import type { UIMessage } from "ai"
import type { SessionUser } from "@/lib/auth"
import { db } from "@/lib/db/client"
import { chatsTable, messagesTable } from "@/lib/db/schema"
import { toChatMessage } from "./mappers"
import { findOwnedChat } from "./repo"

// Later: UIMessage<ChatMetadata, never, ChatTools>
export type ChatMessage = UIMessage

export type ChatListItem = { id: string; title: string }

export type ChatDetail = {
  id: string
  title: string
  canDelete: boolean
  messages: ChatMessage[]
}

export async function getChats(
  requester: SessionUser
): Promise<ChatListItem[]> {
  return db
    .select({ id: chatsTable.id, title: chatsTable.title })
    .from(chatsTable)
    .where(eq(chatsTable.userId, requester.id))
    .orderBy(desc(chatsTable.createdAt)) // Stage 2: newest first
}

// `chatId` must already be parsed by the adapter.
export async function getChat(
  requester: SessionUser,
  chatId: string
): Promise<ChatDetail | null> {
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
