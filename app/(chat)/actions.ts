"use server"
import "server-only"
import * as chats from "@/modules/chats"
import { revalidatePath } from "next/cache"
import { notFound, redirect } from "next/navigation"

// Adapter: parse → module command → map errors → revalidate/redirect.
// The module binds the current user (ADR 0001).

export async function createChatAction() {
  const chat = await chats.createChat()

  revalidatePath("/")
  redirect(`/${chat.id}`)
}

export async function deleteChatAction(chatId: string) {
  try {
    await chats.deleteChat(chatId)
  } catch (error) {
    if (error instanceof chats.ChatNotFound) notFound()
    throw error
  }

  revalidatePath("/")
  redirect("/")
}
