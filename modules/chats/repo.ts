import "server-only"
import { and, eq, max } from "drizzle-orm"
import { db } from "@/lib/db/client"
import { chatsTable, messagesTable } from "@/lib/db/schema"

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Executor = typeof db | Tx

// The ownership check, shared by the read and the write paths.
export async function findOwnedChat(
  exec: Executor,
  userId: string,
  chatId: string
) {
  const [chat] = await exec
    .select({
      id: chatsTable.id,
      title: chatsTable.title,
      userId: chatsTable.userId,
    })
    .from(chatsTable)
    .where(and(eq(chatsTable.id, chatId), eq(chatsTable.userId, userId)))
  return chat ?? null
}

// Not race-safe yet: two concurrent sends can read the same max (Stage 4).
export async function nextPosition(exec: Executor, chatId: string) {
  const [row] = await exec
    .select({ value: max(messagesTable.position) })
    .from(messagesTable)
    .where(eq(messagesTable.chatId, chatId))
  return (row?.value ?? -1) + 1
}
