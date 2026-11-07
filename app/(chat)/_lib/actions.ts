"use server"
import "server-only"
import { requireUser } from "@/lib/auth"
import { db } from "@/lib/db/client"
import { chatsTable, messagesTable } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { notFound, redirect } from "next/navigation"

export async function createChatAction() {
  const user = await requireUser()

  const [chat] = await db
    .insert(chatsTable)
    .values({ userId: user.id, title: "New chat", createdAt: new Date() })
    .returning({ id: chatsTable.id })

  revalidatePath("/")
  redirect(`/${chat.id}`)
}

export async function deleteChatAction(chatId: string) {
  const user = await requireUser()

  await db.transaction(async (tx) => {
    const [chat] = await tx
      .select({ id: chatsTable.id })
      .from(chatsTable)
      .where(and(eq(chatsTable.id, chatId), eq(chatsTable.userId, user.id)))
    if (!chat) notFound()

    // messages.chatId references chats without ON DELETE CASCADE
    await tx.delete(messagesTable).where(eq(messagesTable.chatId, chatId))
    await tx.delete(chatsTable).where(eq(chatsTable.id, chatId))
  })

  revalidatePath("/")
  redirect("/")
}
