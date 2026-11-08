import "server-only"
import { withUser } from "@/lib/auth"
import * as commands from "./commands"
import * as queries from "./queries"

// Public API of the chats module. app/ imports only this file.
// Every function is bound to the current user here, and only here (ADR 0001).

export const getChats = withUser(queries.getChats)
export const getChat = withUser(queries.getChat)

export const createChat = withUser(commands.createChat)
export const deleteChat = withUser(commands.deleteChat)
export const saveUserMessage = withUser(commands.saveUserMessage)
export const saveAssistantMessage = withUser(commands.saveAssistantMessage)

export { sendMessageInput } from "./contracts"
export type {
  ChatDetail,
  ChatListItem,
  ChatMessage,
  SendMessageInput,
} from "./contracts"
export { ChatNotFound } from "./errors"
