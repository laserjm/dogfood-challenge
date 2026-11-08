import { describe, expect, it } from "vitest"
import { insertChat, insertUser } from "@/test/factories"
import { deleteChat } from "./commands"
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
