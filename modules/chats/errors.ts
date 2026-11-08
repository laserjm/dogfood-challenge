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
