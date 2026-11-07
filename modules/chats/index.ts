import "server-only"

// Public API of the chats module. app/ imports only this file.
export { getChat, getChats } from "./queries"
export type { ChatDetail, ChatListItem, ChatMessage } from "./queries"
export {
  createChat,
  deleteChat,
  saveAssistantMessage,
  saveUserMessage,
} from "./commands"
export { sendMessageInput } from "./contracts"
export type { SendMessageInput } from "./contracts"
export { ChatNotFound } from "./errors"
