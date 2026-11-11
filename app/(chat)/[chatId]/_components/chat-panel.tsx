"use client"

import { chatErrorResponse } from "@/modules/chats/contracts"
import { Streamdown } from "streamdown"
import { LoaderCircleIcon, MessageCircleDashedIcon } from "lucide-react"
import { Message, MessageContent, MessageGroup } from "@/components/ui/message"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Trace, TraceIcon, TraceLine, TraceTitle } from "@/components/ui/trace"
import { isStepPart, StepPart, textOf } from "./chat-parts"
import { useChatActions, useChatState } from "./chat-provider"
import { ReasoningRow } from "./reasoning-row"
import { ToolRow } from "./tool-row"

export function ChatPanel() {
  const { messages, status, error, busy } = useChatState()
  const { retry } = useChatActions()

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        <MessageGroup className="mx-auto w-full max-w-3xl gap-6 px-4 py-8">
          {messages.length === 0 && (
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
          )}

          {messages.map((message) => {
            if (message.role === "user") {
              return (
                <Message key={message.id} align="end">
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

            const streaming = busy && message === messages.at(-1)
            const steps = message.parts.filter(isStepPart)
            const reply = textOf(message)

            return (
              <Message key={message.id} align="start">
                <MessageContent className="gap-3">
                  {steps.length > 0 && (
                    <Trace>
                      {steps.map((part, index) => (
                        <StepRow
                          key={"toolCallId" in part ? part.toolCallId : index}
                          part={part}
                          streaming={streaming}
                        />
                      ))}
                    </Trace>
                  )}
                  {reply && (
                    <Bubble variant="ghost">
                      <BubbleContent>
                        <Streamdown isAnimating={streaming}>{reply}</Streamdown>
                      </BubbleContent>
                    </Bubble>
                  )}
                </MessageContent>
              </Message>
            )
          })}

          {/* Between send and the first chunk there is no assistant message yet. */}
          {status === "submitted" && (
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
          )}

          {error && (
            <div
              role="alert"
              className="flex flex-col items-start gap-2 text-sm text-destructive"
            >
              <p>{readableError(error)}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => retry()}
              >
                Try again
              </Button>
            </div>
          )}
        </MessageGroup>
      </div>
    </>
  )
}

function StepRow({ part, streaming }: { part: StepPart; streaming: boolean }) {
  return part.type === "reasoning" ? (
    <ReasoningRow text={part.text} running={part.state === "streaming"} />
  ) : (
    <ToolRow part={part} streaming={streaming} />
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
