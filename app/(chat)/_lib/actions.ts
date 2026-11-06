"use server"

import { requireUser } from "@/lib/auth"
import { db } from "@/lib/db/client"
import { chatsTable, messagesTable } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

export async function deleteChat(chatId: string) {
  const user = await requireUser()

  await db.transaction(async (tx) => {
    const [chat] = await tx
      .select({ id: chatsTable.id })
      .from(chatsTable)
      .where(and(eq(chatsTable.id, chatId), eq(chatsTable.userId, user.id)))
    if (!chat) throw new Error("Chat not found")

    // messages.chatId references chats without ON DELETE CASCADE
    await tx.delete(messagesTable).where(eq(messagesTable.chatId, chatId))
    await tx.delete(chatsTable).where(eq(chatsTable.id, chatId))
  })

  revalidatePath("/chat")
  redirect("/chat")
}
