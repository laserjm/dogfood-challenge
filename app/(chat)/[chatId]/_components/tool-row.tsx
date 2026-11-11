"use client"

import { CircleHelpIcon, CloudSunIcon, MapPinIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace"
import type { ToolPart } from "./chat-parts"
import { useChatActions } from "./chat-provider"

type ToolPartOf<T extends ToolPart["type"]> = Extract<ToolPart, { type: T }>
type ToolVariantProps<T extends ToolPart["type"]> = {
  part: ToolPartOf<T>
  streaming: boolean
}

export type ToolRowProps = { part: ToolPart; streaming: boolean }

// One explicit variant per tool. The return type makes the switch exhaustive:
// a tool added to contracts.ts without a case here fails typecheck.
export function ToolRow({ part, streaming }: ToolRowProps): React.ReactElement {
  switch (part.type) {
    case "tool-getWeatherInformation":
      return <WeatherToolRow part={part} streaming={streaming} />
    case "tool-getLocation":
      return <LocationToolRow part={part} streaming={streaming} />
    case "tool-askForConfirmation":
      return <ConfirmationToolRow part={part} streaming={streaming} />
  }
}

function WeatherToolRow({
  part,
  streaming,
}: ToolVariantProps<"tool-getWeatherInformation">) {
  const city = part.input?.city ?? "…"
  return (
    <ToolStatusRow
      part={part}
      streaming={streaming}
      icon={<CloudSunIcon />}
      running={`Checking the weather in ${city}`}
      done={`Checked the weather in ${city}`}
    />
  )
}

function LocationToolRow({
  part,
  streaming,
}: ToolVariantProps<"tool-getLocation">) {
  return (
    <ToolStatusRow
      part={part}
      streaming={streaming}
      icon={<MapPinIcon />}
      running="Getting your location"
      done="Got your location"
    />
  )
}

function ConfirmationToolRow({
  part,
  streaming,
}: ToolVariantProps<"tool-askForConfirmation">) {
  const { answerConfirmation } = useChatActions()
  const message = part.input?.message

  if (part.state !== "input-available") {
    return (
      <ToolStatusRow
        part={part}
        streaming={streaming}
        icon={<CircleHelpIcon />}
        running={message ?? "Asking for confirmation"}
        done={message ?? "Asked for confirmation"}
      />
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <TraceLine status="pending">
        <TraceIcon>
          <CircleHelpIcon />
        </TraceIcon>
        <TraceTitle>{message}</TraceTitle>
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

type ToolStatusRowProps = {
  part: ToolPart
  streaming: boolean
  icon: React.ReactNode
  running: string
  done: string
}

// The lifecycle every tool shares; the variants above only supply copy and
// an icon.
function ToolStatusRow({
  part,
  streaming,
  icon,
  running,
  done,
}: ToolStatusRowProps) {
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
