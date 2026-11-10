import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { insertChat, insertUser } from "@/test/factories"
import {
  deleteChat,
  saveAssistantMessage,
  saveToolOutputs,
  saveUserMessage,
} from "./commands"
import { ChatNotFound, ToolOutputRejected } from "./errors"
import { getChat } from "./queries"

describe("deleteChat", () => {
  it("throws ChatNotFound for someone else's chat and keeps it", async () => {
    const owner = await insertUser()
    const intruder = await insertUser()
    const chat = await insertChat(owner)

    await expect(deleteChat(intruder, chat.id)).rejects.toBeInstanceOf(
      ChatNotFound
    )
    expect(await getChat(owner, chat.id)).not.toBeNull()
  })
})

describe("saveUserMessage", () => {
  it("throws ChatNotFound for a malformed chat id", async () => {
    const owner = await insertUser()

    await expect(
      saveUserMessage(owner, {
        chatId: "not-a-uuid",
        message: {
          id: randomUUID(),
          role: "user",
          parts: [{ type: "text", text: "hi" }],
        },
      })
    ).rejects.toBeInstanceOf(ChatNotFound)
  })
})

describe("saveAssistantMessage", () => {
  it("stores nothing when the reply did not complete", async () => {
    const owner = await insertUser()
    const chat = await insertChat(owner)

    await saveAssistantMessage(owner, {
      chatId: chat.id,
      message: {
        id: randomUUID(),
        role: "assistant",
        parts: [{ type: "text", text: "partial" }],
      },
      outcome: { status: "aborted" },
    })

    expect((await getChat(owner, chat.id))?.messages).toEqual([])
  })
})

describe("saveToolOutputs", () => {
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

  it("stores the output on the waiting tool call", async () => {
    const { owner, chat, messageId } = await arrangeWaitingCall()

    await saveToolOutputs(owner, {
      chatId: chat.id,
      messageId,
      outputs: [{ toolCallId: "call-1", output: "Chicago" }],
    })

    const [message] = (await getChat(owner, chat.id))?.messages ?? []
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
        outputs: [{ toolCallId: "call-1", output: "Chicago" }],
      })
    ).rejects.toBeInstanceOf(ChatNotFound)
    const [message] = (await getChat(owner, chat.id))?.messages ?? []
    expect(message.parts[1]).toMatchObject({ state: "input-available" })
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
        outputs: [{ toolCallId: "call-1", output: "Chicago" }],
      })
    ).rejects.toBeInstanceOf(ToolOutputRejected)
  })
})
