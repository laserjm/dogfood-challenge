import { randomUUID } from "node:crypto"
import {
  convertReadableStreamToArray,
  MockLanguageModelV4,
  simulateReadableStream,
} from "ai/test"
import { describe, expect, it } from "vitest"
import { insertChat, insertMessage, insertUser } from "@/test/factories"
import {
  continueAfterToolOutputs,
  createChat,
  deleteChat,
  saveAssistantMessage,
  saveToolOutputs,
  saveUserMessage,
  sendMessage,
} from "./commands"
import type { ChatMessage, SendMessageInput } from "./contracts"
import { ChatNotFound, ToolOutputRejected } from "./errors"
import { getChat, getChats } from "./queries"

// A model that answers every call with one text block. Not a db mock: the
// provider is a parameter of the use case (Rule 12), so a test hands in its own.
function replyingModel(text: string) {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "t1" },
          { type: "text-delta", id: "t1", delta: text },
          { type: "text-end", id: "t1" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: undefined },
            usage: {
              inputTokens: {
                total: 1,
                noCache: 1,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: { total: 1, text: 1, reasoning: undefined },
            },
          },
        ],
      }),
    }),
  })
}

const describeError = () => "error"

const userMessage = (text: string): SendMessageInput["message"] => ({
  id: randomUUID(),
  role: "user",
  parts: [{ type: "text", text }],
})

const textOf = (message: ChatMessage) =>
  message.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("")

async function messagesOf(owner: { id: string; name: string }, chatId: string) {
  return (await getChat(owner, chatId))?.messages ?? []
}

describe("createChat", () => {
  it("creates an empty chat owned by the requester", async () => {
    const owner = await insertUser()
    const other = await insertUser()

    const chat = await createChat(owner)

    expect(await getChat(owner, chat.id)).toMatchObject({ messages: [] })
    expect(await getChats(other)).toEqual([])
  })
})

describe("deleteChat", () => {
  it("deletes the chat and its messages", async () => {
    const owner = await insertUser()
    const chat = await insertChat(owner)
    await insertMessage(chat, { role: "user", text: "hi", position: 0 })

    await deleteChat(owner, chat.id)

    expect(await getChat(owner, chat.id)).toBeNull()
  })

  it("throws ChatNotFound for someone else's chat and keeps it", async () => {
    const owner = await insertUser()
    const intruder = await insertUser()
    const chat = await insertChat(owner)

    await expect(deleteChat(intruder, chat.id)).rejects.toBeInstanceOf(
      ChatNotFound
    )
    expect(await getChat(owner, chat.id)).not.toBeNull()
  })

  it("throws ChatNotFound for a malformed id", async () => {
    const owner = await insertUser()

    await expect(deleteChat(owner, "not-a-uuid")).rejects.toBeInstanceOf(
      ChatNotFound
    )
  })
})

describe("sendMessage", () => {
  it("stores the user message and the completed reply", async () => {
    const owner = await insertUser()
    const chat = await insertChat(owner)
    const message = userMessage("Hi")

    const stream = await sendMessage(
      owner,
      { chatId: chat.id, message },
      { model: replyingModel("Hello!"), describeError }
    )
    await convertReadableStreamToArray(stream)

    const stored = await messagesOf(owner, chat.id)
    expect(stored.map((m) => [m.role, textOf(m)])).toEqual([
      ["user", "Hi"],
      ["assistant", "Hello!"],
    ])
    expect(stored[0].id).toBe(message.id)
  })

  it("throws ChatNotFound for someone else's chat and stores nothing", async () => {
    const owner = await insertUser()
    const intruder = await insertUser()
    const chat = await insertChat(owner)
    const model = replyingModel("Hello!")

    await expect(
      sendMessage(
        intruder,
        { chatId: chat.id, message: userMessage("Hi") },
        { model, describeError }
      )
    ).rejects.toBeInstanceOf(ChatNotFound)
    expect(await messagesOf(owner, chat.id)).toEqual([])
    expect(model.doStreamCalls).toHaveLength(0)
  })

  it("throws ChatNotFound for a malformed chat id", async () => {
    const owner = await insertUser()

    await expect(
      sendMessage(
        owner,
        { chatId: "not-a-uuid", message: userMessage("Hi") },
        { model: replyingModel("Hello!"), describeError }
      )
    ).rejects.toBeInstanceOf(ChatNotFound)
  })
})

describe("saveUserMessage", () => {
  it("appends the message after the existing ones, once per id", async () => {
    const owner = await insertUser()
    const chat = await insertChat(owner)
    await insertMessage(chat, { role: "user", text: "first", position: 0 })
    const message = userMessage("second")

    await saveUserMessage(owner, { chatId: chat.id, message })
    await saveUserMessage(owner, { chatId: chat.id, message }) // a retry

    const stored = await messagesOf(owner, chat.id)
    expect(stored.map(textOf)).toEqual(["first", "second"])
  })

  it("throws ChatNotFound for someone else's chat and stores nothing", async () => {
    const owner = await insertUser()
    const intruder = await insertUser()
    const chat = await insertChat(owner)

    await expect(
      saveUserMessage(intruder, { chatId: chat.id, message: userMessage("hi") })
    ).rejects.toBeInstanceOf(ChatNotFound)
    expect(await messagesOf(owner, chat.id)).toEqual([])
  })

  it("throws ChatNotFound for a malformed chat id", async () => {
    const owner = await insertUser()

    await expect(
      saveUserMessage(owner, {
        chatId: "not-a-uuid",
        message: userMessage("hi"),
      })
    ).rejects.toBeInstanceOf(ChatNotFound)
  })
})

describe("saveAssistantMessage", () => {
  const reply = (text: string): ChatMessage => ({
    id: randomUUID(),
    role: "assistant",
    parts: [{ type: "text", text }],
  })

  it("stores a completed reply", async () => {
    const owner = await insertUser()
    const chat = await insertChat(owner)

    await saveAssistantMessage(owner, {
      chatId: chat.id,
      message: reply("done"),
      outcome: { status: "completed" },
    })

    expect((await messagesOf(owner, chat.id)).map(textOf)).toEqual(["done"])
  })

  it("stores nothing when the reply did not complete", async () => {
    const owner = await insertUser()
    const chat = await insertChat(owner)

    await saveAssistantMessage(owner, {
      chatId: chat.id,
      message: reply("partial"),
      outcome: { status: "aborted" },
    })

    expect(await messagesOf(owner, chat.id)).toEqual([])
  })

  it("throws ChatNotFound for someone else's chat and stores nothing", async () => {
    const owner = await insertUser()
    const intruder = await insertUser()
    const chat = await insertChat(owner)

    await expect(
      saveAssistantMessage(intruder, {
        chatId: chat.id,
        message: reply("done"),
        outcome: { status: "completed" },
      })
    ).rejects.toBeInstanceOf(ChatNotFound)
    expect(await messagesOf(owner, chat.id)).toEqual([])
  })

  it("throws ChatNotFound for a malformed chat id", async () => {
    const owner = await insertUser()

    await expect(
      saveAssistantMessage(owner, {
        chatId: "not-a-uuid",
        message: reply("done"),
        outcome: { status: "completed" },
      })
    ).rejects.toBeInstanceOf(ChatNotFound)
  })
})

// A stored assistant message that waits for the browser to answer getLocation.
async function arrangeWaitingCall() {
  const owner = await insertUser()
  const chat = await insertChat(owner)
  const messageId = randomUUID()
  await saveAssistantMessage(owner, {
    chatId: chat.id,
    message: {
      id: messageId,
      role: "assistant",
      parts: [
        { type: "step-start" },
        {
          type: "tool-getLocation",
          toolCallId: "call-1",
          state: "input-available",
          input: {},
        },
      ],
    },
    outcome: { status: "completed" },
  })
  return { owner, chat, messageId }
}

const chicago = [{ toolCallId: "call-1", output: "Chicago" }]

describe("continueAfterToolOutputs", () => {
  it("stores the outputs and continues the same message", async () => {
    const { owner, chat, messageId } = await arrangeWaitingCall()

    const stream = await continueAfterToolOutputs(
      owner,
      { chatId: chat.id, messageId, outputs: chicago },
      { model: replyingModel("Sunny in Chicago."), describeError }
    )
    await convertReadableStreamToArray(stream)

    const [message, ...rest] = await messagesOf(owner, chat.id)
    expect(rest).toEqual([])
    expect(message.id).toBe(messageId)
    expect(message.parts).toContainEqual(
      expect.objectContaining({ state: "output-available", output: "Chicago" })
    )
    expect(textOf(message)).toBe("Sunny in Chicago.")
  })

  it("throws ChatNotFound for someone else's chat and stores nothing", async () => {
    const { owner, chat, messageId } = await arrangeWaitingCall()
    const intruder = await insertUser()
    const model = replyingModel("Sunny.")

    await expect(
      continueAfterToolOutputs(
        intruder,
        { chatId: chat.id, messageId, outputs: chicago },
        { model, describeError }
      )
    ).rejects.toBeInstanceOf(ChatNotFound)
    const [message] = await messagesOf(owner, chat.id)
    expect(message.parts[1]).toMatchObject({ state: "input-available" })
    expect(model.doStreamCalls).toHaveLength(0)
  })

  it("throws ChatNotFound for a malformed chat id", async () => {
    const { owner, messageId } = await arrangeWaitingCall()

    await expect(
      continueAfterToolOutputs(
        owner,
        { chatId: "not-a-uuid", messageId, outputs: chicago },
        { model: replyingModel("Sunny."), describeError }
      )
    ).rejects.toBeInstanceOf(ChatNotFound)
  })
})

describe("saveToolOutputs", () => {
  it("stores the output on the waiting tool call", async () => {
    const { owner, chat, messageId } = await arrangeWaitingCall()

    await saveToolOutputs(owner, {
      chatId: chat.id,
      messageId,
      outputs: chicago,
    })

    const [message] = await messagesOf(owner, chat.id)
    expect(message.parts[1]).toMatchObject({
      state: "output-available",
      output: "Chicago",
    })
  })

  it("throws ChatNotFound for someone else's chat and stores nothing", async () => {
    const { owner, chat, messageId } = await arrangeWaitingCall()
    const intruder = await insertUser()

    await expect(
      saveToolOutputs(intruder, {
        chatId: chat.id,
        messageId,
        outputs: chicago,
      })
    ).rejects.toBeInstanceOf(ChatNotFound)
    const [message] = await messagesOf(owner, chat.id)
    expect(message.parts[1]).toMatchObject({ state: "input-available" })
  })

  it("throws ChatNotFound for a malformed chat id", async () => {
    const { messageId, owner } = await arrangeWaitingCall()

    await expect(
      saveToolOutputs(owner, {
        chatId: "not-a-uuid",
        messageId,
        outputs: chicago,
      })
    ).rejects.toBeInstanceOf(ChatNotFound)
  })

  it("rejects an output of the wrong type", async () => {
    const { owner, chat, messageId } = await arrangeWaitingCall()

    await expect(
      saveToolOutputs(owner, {
        chatId: chat.id,
        messageId,
        outputs: [{ toolCallId: "call-1", output: 42 }],
      })
    ).rejects.toBeInstanceOf(ToolOutputRejected)
  })

  it("rejects outputs for a message that isn't the newest", async () => {
    const { owner, chat } = await arrangeWaitingCall()

    await expect(
      saveToolOutputs(owner, {
        chatId: chat.id,
        messageId: randomUUID(),
        outputs: chicago,
      })
    ).rejects.toBeInstanceOf(ToolOutputRejected)
  })
})
