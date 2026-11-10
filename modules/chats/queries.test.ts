import { describe, expect, it } from "vitest"
import { insertChat, insertMessage, insertUser } from "@/test/factories"
import { getChat, getChats } from "./queries"

describe("getChats", () => {
  it("returns only the requester's chats, newest first", async () => {
    const alice = await insertUser()
    const bob = await insertUser()
    const older = await insertChat(alice, {
      title: "older",
      createdAt: new Date("2026-01-01"),
    })
    const newer = await insertChat(alice, {
      title: "newer",
      createdAt: new Date("2026-01-02"),
    })
    await insertChat(bob, { title: "bob's chat" })

    expect(await getChats(alice)).toEqual([
      { id: newer.id, title: "newer" },
      { id: older.id, title: "older" },
    ])
  })
})

describe("getChat", () => {
  it("returns the chat with its messages in order", async () => {
    const owner = await insertUser()
    const chat = await insertChat(owner, { title: "Lisbon" })
    // Inserted out of order: position decides, not insertion time.
    const second = await insertMessage(chat, {
      role: "assistant",
      text: "Hello!",
      position: 1,
    })
    const first = await insertMessage(chat, {
      role: "user",
      text: "Hi",
      position: 0,
    })

    expect(await getChat(owner, chat.id)).toEqual({
      id: chat.id,
      title: "Lisbon",
      canDelete: true,
      messages: [
        { id: first.id, role: "user", parts: [{ type: "text", text: "Hi" }] },
        {
          id: second.id,
          role: "assistant",
          parts: [{ type: "text", text: "Hello!" }],
        },
      ],
    })
  })

  it("returns null for someone else's chat", async () => {
    const owner = await insertUser()
    const intruder = await insertUser()
    const chat = await insertChat(owner)

    expect(await getChat(intruder, chat.id)).toBeNull()
  })

  it("returns null for a malformed id", async () => {
    const owner = await insertUser()

    expect(await getChat(owner, "not-a-uuid")).toBeNull()
  })
})
