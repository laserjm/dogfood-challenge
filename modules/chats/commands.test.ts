import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { insertChat, insertUser } from "@/test/factories"
import { deleteChat, saveAssistantMessage, saveUserMessage } from "./commands"
import { ChatNotFound } from "./errors"
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
