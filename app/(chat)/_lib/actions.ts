"use server"
import "server-only"
import { requireUser } from "@/lib/auth"
import { isUuid } from "@/lib/ids"
import * as chats from "@/modules/chats"
import { revalidatePath } from "next/cache"
import { notFound, redirect } from "next/navigation"

// Adapter: requireUser() → parse → module command → revalidate/redirect.

export async function createChatAction() {
  const user = await requireUser()
  const chat = await chats.createChat(user)

  revalidatePath("/")
  redirect(`/${chat.id}`)
}

export async function deleteChatAction(chatId: string) {
  const user = await requireUser()
  if (!isUuid(chatId)) notFound()

  try {
    await chats.deleteChat(user, chatId)
  } catch (error) {
    if (error instanceof chats.ChatNotFound) notFound()
    throw error
  }

  revalidatePath("/")
  redirect("/")
}
