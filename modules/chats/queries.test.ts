import { describe, expect, it } from "vitest"
import { insertChat, insertUser } from "@/test/factories"
import { getChats } from "./queries"

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
