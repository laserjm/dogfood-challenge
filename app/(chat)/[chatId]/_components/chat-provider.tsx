"use client"

import { useChat } from "@ai-sdk/react"
import {
  DefaultChatTransport,
  isStaticToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
  type ChatStatus,
} from "ai"
import { createContext, use } from "react"
import type { ChatMessage } from "@/modules/chats/contracts"

// The only file that knows the chat runs on useChat. Everything below the
// provider reads these two contexts and never imports @ai-sdk/react.

export type ChatState = {
  messages: ChatMessage[]
  status: ChatStatus
  error: Error | undefined
  // "error" is not busy: the user must be able to retry or type again.
  busy: boolean
}

export type ChatActions = {
  send: (text: string) => void
  stop: () => void
  retry: () => void
  answerConfirmation: (toolCallId: string, confirmed: boolean) => void
}

// Two contexts: state changes with every streamed chunk, actions never do.
// A component that only sends or stops doesn't re-render while streaming.
const ChatStateContext = createContext<ChatState | null>(null)
const ChatActionsContext = createContext<ChatActions | null>(null)

export function useChatState(): ChatState {
  const state = use(ChatStateContext)
  if (!state) throw new Error("useChatState must be used inside <ChatProvider>")
  return state
}

export function useChatActions(): ChatActions {
  const actions = use(ChatActionsContext)
  if (!actions) {
    throw new Error("useChatActions must be used inside <ChatProvider>")
  }
  return actions
}

// Built once per page load: it closes over nothing from the component.
// Holds no request state, so sharing it during SSR is safe.
const transport = new DefaultChatTransport<ChatMessage>({
  api: "/api/chat",
  // Send only what is new; the server loads the history from the db.
  prepareSendMessagesRequest: ({ id, messages }) => {
    const last = messages.at(-1)
    // An automatic resend after addToolOutput: the newest message is the
    // assistant's, and what's new are the tool outputs on it.
    if (last?.role === "assistant") {
      return {
        body: {
          type: "tool-outputs",
          chatId: id,
          messageId: last.id,
          outputs: last.parts
            .filter(isStaticToolUIPart)
            .filter((part) => part.state === "output-available")
            .map((part) => ({
              toolCallId: part.toolCallId,
              output: part.output,
            })),
        },
      }
    }
    return { body: { type: "message", chatId: id, message: last } }
  },
})

const generateId = () => crypto.randomUUID()

export type ChatProviderProps = {
  chatId: string
  initialMessages: ChatMessage[]
  children: React.ReactNode
}

export function ChatProvider({
  chatId,
  initialMessages,
  children,
}: ChatProviderProps) {
  const {
    messages,
    status,
    error,
    sendMessage,
    regenerate,
    stop,
    addToolOutput,
  } = useChat<ChatMessage>({
    id: chatId,
    messages: initialMessages,
    generateId,
    transport,
    onError: (error) => {
      console.error("[client] chat error", error)
    },
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    // Client-side tools that run without asking the user.
    async onToolCall({ toolCall }) {
      if (toolCall.dynamic) return
      if (toolCall.toolName === "getLocation") {
        // No await: avoids a deadlock with the automatic resend.
        addToolOutput({
          tool: "getLocation",
          toolCallId: toolCall.toolCallId,
          output: pickCity(),
        })
      }
    },
  })

  // No useMemo: the React Compiler memoizes both objects on their inputs.
  // useChat's methods are stable per chat, so `actions` is built once.
  const state: ChatState = {
    messages,
    status,
    error,
    busy: status === "submitted" || status === "streaming",
  }

  const actions: ChatActions = {
    send: (text) => sendMessage({ text }),
    stop: () => stop(),
    // Resends the last user message with the same id: the server stores it
    // once (onConflictDoNothing), so no duplicate.
    retry: () => regenerate(),
    answerConfirmation: (toolCallId, confirmed) =>
      addToolOutput({
        tool: "askForConfirmation",
        toolCallId,
        output: confirmed ? "Yes, confirmed." : "No, denied",
      }),
  }

  return (
    <ChatActionsContext value={actions}>
      <ChatStateContext value={state}>{children}</ChatStateContext>
    </ChatActionsContext>
  )
}

// Stand-in for a real location lookup. Outside the component, because the
// React Compiler treats Math.random inside it as an impure render.
const CITIES = ["New York", "Los Angeles", "Chicago", "San Francisco"]
const pickCity = () => CITIES[Math.floor(Math.random() * CITIES.length)]
