"use client"

import { memo } from "react"
import { Streamdown } from "streamdown"
import type { ChatMessage } from "@/modules/chats/contracts"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Message, MessageContent } from "@/components/ui/message"
import { Trace } from "@/components/ui/trace"
import { isStepPart, textOf } from "./chat-parts"
import { ReasoningRow } from "./reasoning-row"
import { ToolRow } from "./tool-row"

export type ChatMessageRowProps = {
  message: ChatMessage
  streaming: boolean
}

// memo stays even with the React Compiler on: the compiler memoizes the
// list's .map() as a whole, not per item. While a reply streams, useChat
// replaces only the last message object, so every other row skips its render.
export const ChatMessageRow = memo(function ChatMessageRow({
  message,
  streaming,
}: ChatMessageRowProps) {
  if (message.role === "user") {
    return (
      <Message align="end">
        <MessageContent>
          <Bubble variant="secondary" align="end">
            <BubbleContent className="rounded-2xl px-4 py-2.5 whitespace-pre-wrap">
              {textOf(message)}
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    )
  }

  const steps = message.parts.filter(isStepPart)
  const reply = textOf(message)

  return (
    <Message align="start">
      <MessageContent className="gap-3">
        {steps.length > 0 ? (
          <Trace>
            {steps.map((part, index) =>
              part.type === "reasoning" ? (
                <ReasoningRow
                  key={index}
                  text={part.text}
                  running={part.state === "streaming"}
                />
              ) : (
                <ToolRow
                  key={part.toolCallId}
                  part={part}
                  streaming={streaming}
                />
              )
            )}
          </Trace>
        ) : null}
        {reply ? (
          <Bubble variant="ghost">
            <BubbleContent>
              <Streamdown isAnimating={streaming}>{reply}</Streamdown>
            </BubbleContent>
          </Bubble>
        ) : null}
      </MessageContent>
    </Message>
  )
})
