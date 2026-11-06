import { requireUser } from "@/lib/auth"
import { db } from "@/lib/db/client"
import { chatsTable, messagesTable } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export const getChatsByUserId = async () => {
  const user = await requireUser()
  const chats = await db
    .select()
    .from(chatsTable)
    .where(eq(chatsTable.userId, user.id))

  return chats
}

export const getMessagesByChatId = async (chatId: string) => {
  const user = await requireUser()
  const messages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.chatId, chatId))

  return messages
}
