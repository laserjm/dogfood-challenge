import type { UIDataTypes, UIMessage, UITools } from "ai"
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
  // Shape only: the module parses the id (findOwnedChat), so a malformed id
  // is a 404 like a missing one, not a 400.
  chatId: z.string(),
  message: z.object({
    id: z.uuid(),
    role: z.literal("user"),
    parts: z.array(textPart).min(1),
  }),
})
export type SendMessageInput = z.infer<typeof sendMessageInput>

// Tool shapes: one source for the model's tools (tools.ts), for the output the
// browser may send back, and for the typed tool parts the UI renders.
export const toolSchemas = {
  getWeatherInformation: {
    input: z.object({ city: z.string() }),
    output: z.string(),
  },
  askForConfirmation: {
    input: z.object({
      message: z.string().describe("The message to ask for confirmation."),
    }),
    output: z.string(),
  },
  getLocation: { input: z.object({}), output: z.string() },
}

// Tools the browser answers. Every other tool runs on the server.
export const clientToolNames = ["askForConfirmation", "getLocation"] as const
export type ClientToolName = (typeof clientToolNames)[number]

// Shape only: the module checks each output against the tool it belongs to.
export const toolOutputsInput = z.object({
  chatId: z.string(),
  messageId: z.uuid(),
  outputs: z
    .array(z.object({ toolCallId: z.string().min(1), output: z.json() }))
    .max(10),
})
export type ToolOutputsInput = z.infer<typeof toolOutputsInput>

// The body of POST /api/chat: a new user message, or tool outputs.
export const chatRequestInput = z.discriminatedUnion("type", [
  sendMessageInput.extend({ type: z.literal("message") }),
  toolOutputsInput.extend({ type: z.literal("tool-outputs") }),
])

// The body of every error the chat route handler answers with before a stream
// starts. Parsed by the client, because a response body is untrusted input.
export const chatErrorResponse = z.object({ error: z.string() })
export type ChatErrorResponse = z.infer<typeof chatErrorResponse>

// ── Out: DTOs the module returns; no runtime check, the module builds them ──

type ToolSchemas = typeof toolSchemas
export type ChatTools = {
  [K in keyof ToolSchemas]: {
    input: z.infer<ToolSchemas[K]["input"]>
    output: z.infer<ToolSchemas[K]["output"]>
  }
}
export type ChatMessage = UIMessage<unknown, UIDataTypes, ChatTools>

export type ChatListItem = { id: string; title: string }

export type ChatDetail = {
  id: string
  title: string
  canDelete: boolean
  messages: ChatMessage[]
}
