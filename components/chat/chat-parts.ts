import { ChatMessage } from "@/modules/chats/contracts"
import { isStaticToolUIPart } from "ai"

// UI-side views of a message's parts. Derived from ChatMessage, so a new tool
// in contracts.ts shows up here without an edit.
export type ChatPart = ChatMessage["parts"][number]
export type ToolPart = Extract<
  ChatPart,
  { toolCallId: string; type: `tool-${string}` }
>
export type ReasoningPart = Extract<ChatPart, { type: "reasoning" }>
export type StepPart = ToolPart | ReasoningPart

export function isStepPart(part: ChatPart): part is StepPart {
  return part.type === "reasoning" || isStaticToolUIPart(part)
}

// Text parts of one message; steps between them are separate paragraphs.
export function textOf(message: ChatMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n\n")
}
