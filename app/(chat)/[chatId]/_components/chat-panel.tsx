"use client"

import { chatErrorResponse } from "@/modules/chats/contracts"
import { useState } from "react"
import { Streamdown } from "streamdown"
import {
  CircleCheckIcon,
  CircleHelpIcon,
  CloudSunIcon,
  LoaderCircleIcon,
  MapPinIcon,
  MessageCircleDashedIcon,
} from "lucide-react"
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
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace"
import { isStepPart, StepPart, textOf, ToolPart } from "./chat-parts"
import { useChatActions, useChatState } from "./chat-provider"

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
  if (part.type === "reasoning") {
    return (
      <ReasoningRow text={part.text} running={part.state === "streaming"} />
    )
  }
  if (
    part.type === "tool-askForConfirmation" &&
    part.state === "input-available"
  ) {
    return <ConfirmationRow part={part} />
  }
  return <ToolRow part={part} streaming={streaming} />
}

function ReasoningRow({ text, running }: { text: string; running: boolean }) {
  // undefined until the user toggles it: follows `running` until then.
  const [open, setOpen] = useState<boolean>()

  return (
    <TraceCollapsible open={open ?? running} onOpenChange={setOpen}>
      <TraceCollapsibleTrigger>
        <TraceLine status={running ? "running" : undefined}>
          <TraceIcon>
            {running ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <CircleCheckIcon />
            )}
          </TraceIcon>
          <TraceTitle>{running ? "Thinking" : "Thought"}</TraceTitle>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent className="whitespace-pre-wrap">
        {text}
      </TraceCollapsibleContent>
    </TraceCollapsible>
  )
}

function ConfirmationRow({
  part,
}: {
  part: Extract<ToolPart, { type: "tool-askForConfirmation" }>
}) {
  const { answerConfirmation } = useChatActions()

  return (
    <div className="flex flex-col gap-2">
      <TraceLine status="pending">
        <TraceIcon>
          <CircleHelpIcon />
        </TraceIcon>
        <TraceTitle>{part.input?.message}</TraceTitle>
      </TraceLine>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => answerConfirmation(part.toolCallId, true)}
        >
          Yes
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => answerConfirmation(part.toolCallId, false)}
        >
          No
        </Button>
      </div>
    </div>
  )
}

function ToolRow({ part, streaming }: { part: ToolPart; streaming: boolean }) {
  const { icon, running, done } = describeTool(part)

  if (part.state === "output-available" || part.state === "output-error") {
    const failed = part.state === "output-error"
    return (
      <TraceCollapsible>
        <TraceCollapsibleTrigger>
          <TraceLine status={failed ? "error" : undefined}>
            <TraceIcon>{icon}</TraceIcon>
            <TraceTitle>{failed ? `Failed: ${running}` : done}</TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent className="whitespace-pre-wrap">
          {failed ? part.errorText : part.output}
        </TraceCollapsibleContent>
      </TraceCollapsible>
    )
  }

  if (part.state === "output-denied") {
    return (
      <TraceLine status="error">
        <TraceIcon>{icon}</TraceIcon>
        <TraceTitle>Denied: {running}</TraceTitle>
      </TraceLine>
    )
  }

  if (
    part.state === "approval-requested" ||
    part.state === "approval-responded"
  ) {
    return (
      <TraceLine status="pending">
        <TraceIcon>{icon}</TraceIcon>
        <TraceTitle>Waiting for approval: {running}</TraceTitle>
      </TraceLine>
    )
  }

  // input-streaming / input-available: still running, or the stream was
  // stopped before the tool answered.
  return (
    <TraceLine status={streaming ? "running" : "error"}>
      <TraceIcon>{icon}</TraceIcon>
      <TraceTitle>{streaming ? running : `Stopped: ${running}`}</TraceTitle>
    </TraceLine>
  )
}

function describeTool(part: ToolPart) {
  switch (part.type) {
    case "tool-getWeatherInformation": {
      const city = part.input?.city ?? "…"
      return {
        icon: <CloudSunIcon />,
        running: `Checking the weather in ${city}`,
        done: `Checked the weather in ${city}`,
      }
    }
    case "tool-getLocation":
      return {
        icon: <MapPinIcon />,
        running: "Getting your location",
        done: "Got your location",
      }
    case "tool-askForConfirmation":
      return {
        icon: <CircleHelpIcon />,
        running: part.input?.message ?? "Asking for confirmation",
        done: part.input?.message ?? "Asked for confirmation",
      }
  }
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
