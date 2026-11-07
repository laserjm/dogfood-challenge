import "server-only"
import { and, asc, desc, eq } from "drizzle-orm"
import { requireUser } from "@/lib/auth"
import { db } from "@/lib/db/client"
import { chatsTable, messagesTable } from "@/lib/db/schema"

export type ChatListItem = { id: string; title: string }

export type ChatDetail = {
  id: string
  title: string
  canDelete: boolean
  messages: {
    id: string
    role: string
    parts: (typeof messagesTable.$inferSelect)["parts"]
  }[]
}

export async function getChatsByUserId(): Promise<ChatListItem[]> {
  const user = await requireUser()
  return db
    .select({ id: chatsTable.id, title: chatsTable.title })
    .from(chatsTable)
    .where(eq(chatsTable.userId, user.id))
    .orderBy(desc(chatsTable.createdAt)) // Stage 2: newest first
}

export async function getChatById(chatId: string): Promise<ChatDetail | null> {
  const user = await requireUser()

  const [chat] = await db
    .select({
      id: chatsTable.id,
      title: chatsTable.title,
      userId: chatsTable.userId,
    })
    .from(chatsTable)
    .where(and(eq(chatsTable.id, chatId), eq(chatsTable.userId, user.id)))
  if (!chat) return null

  const messages = await db
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
    canDelete: chat.userId === user.id,
    messages,
  }
}
