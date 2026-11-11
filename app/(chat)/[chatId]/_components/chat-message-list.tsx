"use client"

import { LoaderCircleIcon, MessageCircleDashedIcon } from "lucide-react"
import { chatErrorResponse } from "@/modules/chats/contracts"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Message, MessageContent, MessageGroup } from "@/components/ui/message"
import { TraceIcon, TraceLine, TraceTitle } from "@/components/ui/trace"
import { ChatMessageRow } from "./chat-message-row"
import { useChatActions, useChatState } from "./chat-provider"

export function ChatMessageList() {
  const { messages, status, error, busy } = useChatState()
  const { retry } = useChatActions()
  const last = messages.at(-1)

  return (
    <div className="flex-1 overflow-y-auto">
      <MessageGroup className="mx-auto w-full max-w-3xl gap-6 px-4 py-8">
        {messages.length === 0 ? <ChatEmpty /> : null}

        {messages.map((message) => (
          <ChatMessageRow
            key={message.id}
            message={message}
            streaming={busy && message === last}
          />
        ))}

        {/* Between send and the first chunk there is no assistant message yet. */}
        {status === "submitted" ? (
          <Message align="start">
            <MessageContent>
              <TraceLine status="running">
                <TraceIcon>
                  <LoaderCircleIcon className="animate-spin" />
                </TraceIcon>
                <TraceTitle>Thinking</TraceTitle>
              </TraceLine>
            </MessageContent>
          </Message>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="flex flex-col items-start gap-2 text-sm text-destructive"
          >
            <p>{readableError(error)}</p>
            <Button type="button" variant="outline" size="sm" onClick={retry}>
              Try again
            </Button>
          </div>
        ) : null}
      </MessageGroup>
    </div>
  )
}

function ChatEmpty() {
  return (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <MessageCircleDashedIcon />
        </EmptyMedia>
        <EmptyTitle>What should we build?</EmptyTitle>
        <EmptyDescription>
          Ask about the weather, or anything else. Press send to start.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

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
