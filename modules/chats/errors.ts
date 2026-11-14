import "server-only"

// Missing and not-owned look the same, so ownership isn't leaked.
// Adapters map this to `notFound()` or 404.
export class ChatNotFound extends Error {
  override readonly name = "ChatNotFound"
  readonly chatId: string

  constructor(chatId: string) {
    super(`Chat ${chatId} not found`)
    this.chatId = chatId
  }
}

// The outputs don't answer the newest assistant message (another tab moved
// on, or a call is still unanswered). Adapters map this to 409.
export class ToolOutputRejected extends Error {
  override readonly name = "ToolOutputRejected"
  readonly messageId: string

  constructor(messageId: string, reason: string) {
    super(`Tool outputs for message ${messageId} rejected: ${reason}`)
    this.messageId = messageId
  }
}

// Every class above, so an adapter's `switch` on `name` sees each one and a
// new class fails to compile until every adapter maps it.
// test/errors.test.ts checks that nothing is left out.
export const chatErrors = [ChatNotFound, ToolOutputRejected] as const
export type ChatError = InstanceType<(typeof chatErrors)[number]>
export function isChatError(error: unknown): error is ChatError {
  return chatErrors.some((type) => error instanceof type)
}
