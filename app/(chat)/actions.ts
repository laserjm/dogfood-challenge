"use server"
import "server-only"
import * as chats from "@/modules/chats"
import { revalidatePath } from "next/cache"
import { notFound, redirect } from "next/navigation"
import { chatRefusal } from "./refusals"

// Adapter: parse → module command → refusal → revalidate/redirect.
// The module binds the current user (ADR 0001); refusals.ts says what each
// module error means here.

export async function createChatAction() {
  const chat = await chats.createChat()

  revalidatePath("/")
  redirect(`/${chat.id}`)
}

export async function deleteChatAction(chatId: string) {
  try {
    await chats.deleteChat(chatId)
  } catch (error) {
    const refusal = chatRefusal(error)
    if (refusal === "notFound") notFound()
    return refusal
  }

  revalidatePath("/")
  redirect("/")
}
