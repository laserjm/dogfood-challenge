import "server-only"
import { z } from "zod"

// The client may only send text. Tool parts are produced on the server.
const textPart = z.object({
  type: z.literal("text"),
  text: z.string().trim().min(1),
})

export const sendMessageInput = z.object({
  chatId: z.uuid(),
  message: z.object({
    id: z.uuid(),
    role: z.literal("user"),
    parts: z.array(textPart).min(1),
  }),
})
export type SendMessageInput = z.infer<typeof sendMessageInput>
