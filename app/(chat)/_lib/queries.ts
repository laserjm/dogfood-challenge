import "server-only"
import { requireUser } from "@/lib/auth"
import { isUuid } from "@/lib/ids"
import * as chats from "@/modules/chats"

// Adapter: requireUser() → parse → module query.

export async function getChats() {
  const user = await requireUser()
  return chats.getChats(user)
}

export async function getChat(id: string) {
  const user = await requireUser()
  if (!isUuid(id)) return null
  return chats.getChat(user, id)
}
