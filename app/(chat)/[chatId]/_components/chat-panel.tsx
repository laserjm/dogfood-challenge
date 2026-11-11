"use client"

import { chatErrorResponse, type ChatMessage } from "@/modules/chats/contracts"
import { useChat } from "@ai-sdk/react"
import {
  DefaultChatTransport,
  isStaticToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai"
import { useRef, useState } from "react"
import { Streamdown } from "streamdown"
import {
  ArrowUpIcon,
  CircleCheckIcon,
  CircleHelpIcon,
  CloudSunIcon,
  LoaderCircleIcon,
  MapPinIcon,
  MessageCircleDashedIcon,
  SquareIcon,
} from "lucide-react"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
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

type AddToolOutput = ReturnType<typeof useChat<ChatMessage>>["addToolOutput"]

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

  const [text, setText] = useState("")
  const formRef = useRef<HTMLFormElement>(null)

  // "error" is not busy: the user must be able to retry or type again.
  const busy = status === "submitted" || status === "streaming"
  const canSend = text.trim().length > 0 && !busy

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSend) return
    sendMessage({ text })
    setText("")
  }

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
                          addToolOutput={addToolOutput}
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
              {/* Resends the last user message with the same id: the server
                  stores it once (onConflictDoNothing), so no duplicate. */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => regenerate()}
              >
                Try again
              </Button>
            </div>
          )}
        </MessageGroup>
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 pb-6">
        <form ref={formRef} onSubmit={onSubmit} autoComplete="off">
          <InputGroup>
            <InputGroupTextarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Ask the agent..."
              aria-label="Message"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  formRef.current?.requestSubmit()
                }
              }}
              className="p-3"
              name="prompt"
              autoCorrect="off"
              spellCheck={false}
              data-1p-ignore // 1Password
              data-lpignore="true" // LastPass
              data-form-type="other" // Dashlane & generic heuristics
            />
            <InputGroupAddon align="inline-end">
              {busy ? (
                <InputGroupButton
                  type="button"
                  size="icon-sm"
                  variant="default"
                  className="rounded-full"
                  onClick={() => stop()}
                  aria-label="Stop"
                >
                  <SquareIcon className="fill-current" />
                </InputGroupButton>
              ) : (
                <InputGroupButton
                  type="submit"
                  size="icon-sm"
                  variant="default"
                  className="rounded-full"
                  disabled={!canSend}
                  aria-label="Send"
                >
                  <ArrowUpIcon />
                </InputGroupButton>
              )}
            </InputGroupAddon>
          </InputGroup>
        </form>
      </div>
    </>
  )
}

function StepRow({
  part,
  streaming,
  addToolOutput,
}: {
  part: StepPart
  streaming: boolean
  addToolOutput: AddToolOutput
}) {
  if (part.type === "reasoning") {
    return (
      <ReasoningRow text={part.text} running={part.state === "streaming"} />
    )
  }
  if (
    part.type === "tool-askForConfirmation" &&
    part.state === "input-available"
  ) {
    return <ConfirmationRow part={part} addToolOutput={addToolOutput} />
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
  addToolOutput,
}: {
  part: Extract<ToolPart, { type: "tool-askForConfirmation" }>
  addToolOutput: AddToolOutput
}) {
  const answer = (output: string) =>
    addToolOutput({
      tool: "askForConfirmation",
      toolCallId: part.toolCallId,
      output,
    })

  return (
    <div className="flex flex-col gap-2">
      <TraceLine status="pending">
        <TraceIcon>
          <CircleHelpIcon />
        </TraceIcon>
        <TraceTitle>{part.input?.message}</TraceTitle>
      </TraceLine>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => answer("Yes, confirmed.")}>
          Yes
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => answer("No, denied")}
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
