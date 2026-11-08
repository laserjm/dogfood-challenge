import type { UIMessage } from "ai"
import { z } from "zod"

// Boundary types of the chats module: what goes in, and what comes out.
// Browser-safe on purpose (Rule 6): forms validate with the same schema the action parses.

// ── In: untrusted input, validated at runtime ──────────────────────────────

export const chatIdInput = z.uuid()

// The client may only send text. Tool parts are produced on the server.
const textPart = z.object({
  type: z.literal("text"),
  text: z.string().trim().min(1),
})

export const sendMessageInput = z.object({
  chatId: chatIdInput,
  message: z.object({
    id: z.uuid(),
    role: z.literal("user"),
    parts: z.array(textPart).min(1),
  }),
})
export type SendMessageInput = z.infer<typeof sendMessageInput>

// ── Out: DTOs the module returns; no runtime check, the module builds them ──

// Later: UIMessage<ChatMetadata, never, ChatTools>
export type ChatMessage = UIMessage

export type ChatListItem = { id: string; title: string }

export type ChatDetail = {
  id: string
  title: string
  canDelete: boolean
  messages: ChatMessage[]
}
