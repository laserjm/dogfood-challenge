"use client"

import Spinner from "@/components/spinner"
import { errorBody } from "@/lib/http"
import type { ChatMessage } from "@/modules/chats/contracts"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { useState } from "react"

export type ChatPanelProps = {
  chatId: string
  initialMessages: ChatMessage[]
}

export function ChatPanel({ chatId, initialMessages }: ChatPanelProps) {
  const { messages, sendMessage, regenerate, status, stop, error } = useChat({
    id: chatId,
    messages: initialMessages,
    generateId: () => crypto.randomUUID(),
    transport: new DefaultChatTransport({
      api: "/api/chat",
      // Send only the newest message; the server loads the history from the db.
      prepareSendMessagesRequest: ({ id, messages }) => ({
        body: { chatId: id, message: messages.at(-1) },
      }),
    }),
    onError: (error) => {
      console.error("[client] chat error", error)
    },
  })
  const [input, setInput] = useState("")
  // "error" is not busy: the user must be able to retry or type again.
  const busy = status === "submitted" || status === "streaming"

  return (
    <>
      {messages.map((message) => (
        <div key={message.id}>
          {message.role === "user" ? "User: " : "AI: "}
          {message.parts.map((part, index) =>
            part.type === "text" ? <span key={index}>{part.text}</span> : null
          )}
        </div>
      ))}

      {busy && (
        <div>
          {status === "submitted" && <Spinner />}
          <button type="button" onClick={() => stop()}>
            Stop
          </button>
        </div>
      )}

      {error && (
        <div role="alert">
          <p>{readableError(error)}</p>
          {/* Resends the last user message with the same id: the server
              stores it once (onConflictDoNothing), so no duplicate. */}
          <button type="button" onClick={() => regenerate()}>
            Try again
          </button>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (input.trim()) {
            sendMessage({ text: input })
            setInput("")
          }
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
          placeholder="Say something..."
        />
        <button type="submit" disabled={busy}>
          Submit
        </button>
      </form>
    </>
  )
}

const FALLBACK = "Something went wrong. Try again in a moment."

// Two shapes arrive here:
// - HTTP error before the stream: `message` is the raw body, our `{ error }` JSON;
// - error chunk during the stream: `message` is already the route handler's copy.
function readableError(error: Error): string {
  try {
    const body = errorBody.safeParse(JSON.parse(error.message))
    if (body.success) return body.data.error
  } catch {
    // Not JSON: an in-stream message, or a body we didn't write.
  }
  return error.message.startsWith("<") ? FALLBACK : error.message || FALLBACK
}
