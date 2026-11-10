import "server-only"
import {
  convertToModelMessages,
  getToolName,
  isStaticToolUIPart,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type LanguageModel,
  type UIMessageStreamOutcome,
} from "ai"
import { and, eq } from "drizzle-orm"
import type { SessionUser } from "@/lib/auth"
import { db } from "@/lib/db/client"
import { chatsTable, messagesTable } from "@/lib/db/schema"
import {
  clientToolNames,
  toolSchemas,
  type ChatMessage,
  type ClientToolName,
  type SendMessageInput,
  type ToolOutputsInput,
} from "./contracts"
import { ChatNotFound, ToolOutputRejected } from "./errors"
import { toChatMessage, toMessageRow } from "./mappers"
import { getChat } from "./queries"
import { findLastMessage, findOwnedChat, nextPosition } from "./repo"
import { chatTools } from "./tools"

const INSTRUCTIONS = "You are a helpful assistant."

export async function createChat(requester: SessionUser) {
  const [chat] = await db
    .insert(chatsTable)
    .values({ userId: requester.id, title: "New chat", createdAt: new Date() })
    .returning({ id: chatsTable.id })
  return chat
}

export async function deleteChat(requester: SessionUser, chatId: string) {
  await db.transaction(async (tx) => {
    const chat = await findOwnedChat(tx, requester.id, chatId)
    if (!chat) throw new ChatNotFound(chatId)

    // messages.chatId references chats without ON DELETE CASCADE
    await tx.delete(messagesTable).where(eq(messagesTable.chatId, chat.id))
    await tx.delete(chatsTable).where(eq(chatsTable.id, chat.id))
  })
}

// The whole reply: store the user message, answer from the stored history,
// store the reply when the stream ends. `requester` is captured for the
// stream's lifetime, so nothing resolves the user after the response started.
// The adapter passes the model and the error copy; the module never reads env
// and never decides what a user is told.
export type SendMessageOptions = {
  model: LanguageModel
  // Text for the error chunk the client receives once streaming has started.
  describeError: (error: unknown) => string
}

export async function sendMessage(
  requester: SessionUser,
  input: SendMessageInput,
  options: SendMessageOptions
) {
  await saveUserMessage(requester, input) // ownership check; throws ChatNotFound
  return streamReply(requester, input.chatId, options)
}

// The browser answered the client tools of the newest assistant message:
// store the outputs on that message, then let the model continue it.
export async function continueAfterToolOutputs(
  requester: SessionUser,
  input: ToolOutputsInput,
  options: SendMessageOptions
) {
  await saveToolOutputs(requester, input) // ownership check; throws ChatNotFound
  return streamReply(requester, input.chatId, options)
}

async function streamReply(
  requester: SessionUser,
  chatId: string,
  { model, describeError }: SendMessageOptions
) {
  // History comes from the db, not from the client.
  const chat = await getChat(requester, chatId)
  if (!chat) throw new ChatNotFound(chatId) // deleted in between

  const result = streamText({
    model,
    instructions: INSTRUCTIONS,
    messages: await convertToModelMessages(chat.messages, { tools: chatTools }),
    tools: chatTools,
    // Server tools run in a loop here; the loop stops at a client tool.
    stopWhen: stepCountIs(5),
    onError: ({ error }) => {
      console.error("[chats] generation error", error)
    },
  })

  return toUIMessageStream({
    stream: result.stream,
    // If the last message is the assistant's, the reply continues it (same id).
    originalMessages: chat.messages,
    onError: describeError,
    generateMessageId: () => crypto.randomUUID(),
    onEnd: async ({ responseMessage, outcome }) => {
      // The response is already streaming: errors can't reach the client
      // any more, so log them instead of throwing.
      try {
        await saveAssistantMessage(requester, {
          chatId: chat.id,
          message: responseMessage,
          outcome,
        })
      } catch (error) {
        console.error("[chats] saving assistant message failed", error)
      }
    },
  })
}

// Only the newest message can take outputs, and only for client tool calls
// that are still waiting. Anything else the browser sends is ignored, so it
// can't overwrite a server tool's result or the model's text.
export async function saveToolOutputs(
  requester: SessionUser,
  input: ToolOutputsInput
) {
  await db.transaction(async (tx) => {
    const chat = await findOwnedChat(tx, requester.id, input.chatId)
    if (!chat) throw new ChatNotFound(input.chatId)

    const last = await findLastMessage(tx, chat.id)
    if (last?.role !== "assistant" || last.id !== input.messageId) {
      throw new ToolOutputRejected(input.messageId, "not the newest message")
    }

    const parts = applyToolOutputs(toChatMessage(last).parts, input.outputs)
    if (parts.some(isWaitingToolCall)) {
      throw new ToolOutputRejected(input.messageId, "a tool call is unanswered")
    }

    await tx
      .update(messagesTable)
      .set({ parts })
      .where(
        and(eq(messagesTable.id, last.id), eq(messagesTable.chatId, chat.id))
      )
  })
}

function applyToolOutputs(
  parts: ChatMessage["parts"],
  outputs: ToolOutputsInput["outputs"]
): ChatMessage["parts"] {
  return parts.map((part) => {
    if (!isWaitingToolCall(part)) return part
    const toolName = getToolName(part)
    if (!isClientTool(toolName)) return part

    const sent = outputs.find((o) => o.toolCallId === part.toolCallId)
    if (!sent) return part
    const output = toolSchemas[toolName].output.safeParse(sent.output)
    if (!output.success) return part

    return { ...part, state: "output-available", output: output.data }
  })
}

const isWaitingToolCall = (part: ChatMessage["parts"][number]) =>
  isStaticToolUIPart(part) && part.state === "input-available"

const isClientTool = (name: string): name is ClientToolName =>
  clientToolNames.some((n) => n === name)

// Role is fixed by the command, never by the caller. A retry with the same
// message id is a no-op.
export async function saveUserMessage(
  requester: SessionUser,
  input: SendMessageInput
) {
  await db.transaction(async (tx) => {
    const chat = await findOwnedChat(tx, requester.id, input.chatId)
    if (!chat) throw new ChatNotFound(input.chatId)

    const position = await nextPosition(tx, chat.id)
    await tx
      .insert(messagesTable)
      .values(toMessageRow(chat.id, input.message, position))
      .onConflictDoNothing({ target: messagesTable.id })
  })
}

// Decision (Stage 4): only completed replies are stored; aborted and failed
// ones are dropped. Upsert by id so a continuation updates the same row.
// Position is set on the first insert and never changed.
export async function saveAssistantMessage(
  requester: SessionUser,
  input: {
    chatId: string
    message: ChatMessage
    outcome: UIMessageStreamOutcome
  }
) {
  if (input.outcome.status !== "completed") return
  if (input.message.role !== "assistant") {
    throw new Error(
      `Expected an assistant message, got "${input.message.role}"`
    )
  }

  await db.transaction(async (tx) => {
    const chat = await findOwnedChat(tx, requester.id, input.chatId)
    if (!chat) throw new ChatNotFound(input.chatId)

    const position = await nextPosition(tx, chat.id)
    await tx
      .insert(messagesTable)
      .values(toMessageRow(chat.id, input.message, position))
      .onConflictDoUpdate({
        target: messagesTable.id,
        set: { parts: input.message.parts },
        setWhere: and(
          eq(messagesTable.chatId, chat.id),
          eq(messagesTable.role, "assistant")
        ),
      })
  })
}
