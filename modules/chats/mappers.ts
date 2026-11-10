import "server-only"
import type { messagesTable } from "@/lib/db/schema"
import type { ChatMessage } from "./contracts"

type MessageRow = typeof messagesTable.$inferSelect
type NewMessageRow = typeof messagesTable.$inferInsert

export const toChatMessage = (
  row: Pick<MessageRow, "id" | "role" | "parts">
): ChatMessage => ({
  id: row.id,
  role: row.role,
  // The column is typed with the SDK's untyped parts (lib/ can't import
  // modules/); the module only ever stores ChatMessage parts.
  parts: row.parts as ChatMessage["parts"],
})

export const toMessageRow = (
  chatId: string,
  message: ChatMessage,
  position: number
): NewMessageRow => ({
  id: message.id,
  chatId,
  role: message.role,
  parts: message.parts,
  attachments: [],
  position,
  createdAt: new Date(),
})
