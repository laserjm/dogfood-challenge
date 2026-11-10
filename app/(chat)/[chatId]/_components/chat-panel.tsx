"use client"

import Spinner from "@/components/spinner"
import { chatErrorResponse, type ChatMessage } from "@/modules/chats/contracts"
import { useChat } from "@ai-sdk/react"
import {
  DefaultChatTransport,
  isStaticToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai"
import { useState } from "react"

export type ChatPanelProps = {
  chatId: string
  initialMessages: ChatMessage[]
}

export function ChatPanel({ chatId, initialMessages }: ChatPanelProps) {
  const {
    messages,
    sendMessage,
    regenerate,
    addToolOutput,
    status,
    stop,
    error,
  } = useChat({
    id: chatId,
    messages: initialMessages,
    generateId: () => crypto.randomUUID(),
    transport: new DefaultChatTransport({
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
    }),
    onError: (error) => {
      console.error("[client] chat error", error)
    },

    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    // run client-side tools that are automatically executed:
    async onToolCall({ toolCall }) {
      // Check if it's a dynamic tool first for proper type narrowing
      if (toolCall.dynamic) {
        return
      }
      if (toolCall.toolName === "getLocation") {
        // No await - avoids potential deadlocks
        addToolOutput({
          tool: "getLocation",
          toolCallId: toolCall.toolCallId,
          output: pickCity(),
        })
      }
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
          {message.parts.map((part, index) => {
            // part.type === "text" ? <span key={index}>{part.text}</span> : null
            switch (part.type) {
              // render text parts as simple text:
              case "text":
                return <span key={index}>{part.text}</span>
              // for tool parts, use the typed tool part names:
              case "tool-askForConfirmation": {
                const callId = part.toolCallId
                switch (part.state) {
                  case "input-streaming":
                    return (
                      <div key={callId}>Loading confirmation request...</div>
                    )
                  case "input-available":
                    return (
                      <div key={callId}>
                        {part.input.message}
                        <div>
                          <button
                            onClick={() =>
                              addToolOutput({
                                tool: "askForConfirmation",
                                toolCallId: callId,
                                output: "Yes, confirmed.",
                              })
                            }
                          >
                            Yes
                          </button>
                          <button
                            onClick={() =>
                              addToolOutput({
                                tool: "askForConfirmation",
                                toolCallId: callId,
                                output: "No, denied",
                              })
                            }
                          >
                            No
                          </button>
                        </div>
                      </div>
                    )
                  case "approval-requested":
                    return <div key={callId}>Approval requested.</div>
                  case "approval-responded":
                    return <div key={callId}>Approval response received.</div>
                  case "output-available":
                    return (
                      <div key={callId}>Confirmation result: {part.output}</div>
                    )
                  case "output-error":
                    return <div key={callId}>Error: {part.errorText}</div>
                  case "output-denied":
                    return <div key={callId}>Tool call denied.</div>
                }
                break
              }
              case "tool-getLocation": {
                const callId = part.toolCallId
                switch (part.state) {
                  case "input-streaming":
                    return <div key={callId}>Preparing location request...</div>
                  case "input-available":
                    return <div key={callId}>Getting location...</div>
                  case "approval-requested":
                    return <div key={callId}>Approval requested.</div>
                  case "approval-responded":
                    return <div key={callId}>Approval response received.</div>
                  case "output-available":
                    return <div key={callId}>Location: {part.output}</div>
                  case "output-error":
                    return (
                      <div key={callId}>
                        Error getting location: {part.errorText}
                      </div>
                    )
                  case "output-denied":
                    return <div key={callId}>Location request denied.</div>
                }
                break
              }
              case "tool-getWeatherInformation": {
                const callId = part.toolCallId
                switch (part.state) {
                  // example of pre-rendering streaming tool inputs:
                  case "input-streaming":
                    return (
                      <pre key={callId}>{JSON.stringify(part, null, 2)}</pre>
                    )
                  case "input-available":
                    return (
                      <div key={callId}>
                        Getting weather information for {part.input.city}...
                      </div>
                    )
                  case "approval-requested":
                    return <div key={callId}>Approval requested.</div>
                  case "approval-responded":
                    return <div key={callId}>Approval response received.</div>
                  case "output-available":
                    return (
                      <div key={callId}>
                        Weather in {part.input.city}: {part.output}
                      </div>
                    )
                  case "output-error":
                    return (
                      <div key={callId}>
                        Error getting weather for {part.input?.city}:{" "}
                        {part.errorText}
                      </div>
                    )
                  case "output-denied":
                    return <div key={callId}>Weather request denied.</div>
                }
                break
              }
            }
          })}
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

// Stand-in for a real location lookup. Outside the component, because the
// React Compiler treats Math.random inside it as an impure render.
const CITIES = ["New York", "Los Angeles", "Chicago", "San Francisco"]
const pickCity = () => CITIES[Math.floor(Math.random() * CITIES.length)]

const FALLBACK = "Something went wrong. Try again in a moment."

// Two shapes arrive here:
// - HTTP error before the stream: `message` is the raw body, our `{ error }` JSON;
// - error chunk during the stream: `message` is already describeAiError's copy.
function readableError(error: Error): string {
  try {
    const body = chatErrorResponse.safeParse(JSON.parse(error.message))
    if (body.success) return body.data.error
  } catch {
    // Not JSON: an in-stream message, or a body we didn't write.
  }
  return error.message.startsWith("<") ? FALLBACK : error.message || FALLBACK
}
