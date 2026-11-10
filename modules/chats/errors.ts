import "server-only"

// Missing and not-owned look the same, so ownership isn't leaked.
// Adapters map this to `notFound()`.
export class ChatNotFound extends Error {
  readonly chatId: string

  constructor(chatId: string) {
    super(`Chat ${chatId} not found`)
    this.name = "ChatNotFound"
    this.chatId = chatId
  }
}

// The outputs don't answer the newest assistant message (another tab moved
// on, or a call is still unanswered). Adapters map this to 409.
export class ToolOutputRejected extends Error {
  readonly messageId: string
  constructor(messageId: string, reason: string) {
    super(`Tool outputs for message ${messageId} rejected: ${reason}`)
    this.name = "ToolOutputRejected"
    this.messageId = messageId
  }
}
