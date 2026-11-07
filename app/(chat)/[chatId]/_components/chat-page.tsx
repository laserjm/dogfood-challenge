"use client"

import Spinner from "@/components/spinner"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { useState } from "react"

export type Parts = {
  type: string
  text: string
}

export type DatabaseMessages = {
  id: string
  role: "user" | "assistant"
  parts: Parts[]
}

export type ChatMessagesProps = {
  id: string
  initialMessages: UIMessage[]
}

export default function Page({ id, initialMessages }: ChatMessagesProps) {
  const { messages, sendMessage, status, stop } = useChat({
    id: id,
    messages: initialMessages,
    generateId: () => crypto.randomUUID(),
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
    onFinish: ({ message, messages, isError }) => {
      console.log(
        "[client] completed response",
        JSON.stringify({ message, messages, isError }, null, 2)
      )
    },
    onError: (error) => {
      console.error("[client] chat error", error)
    },
  })
  const [input, setInput] = useState("")

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

      {(status === "submitted" || status === "streaming") && (
        <div>
          {status === "submitted" && <Spinner />}
          <button type="button" onClick={() => stop()}>
            Stop
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
          disabled={status !== "ready"}
          placeholder="Say something..."
        />
        <button type="submit" disabled={status !== "ready"}>
          Submit
        </button>
      </form>
    </>
  )
}
