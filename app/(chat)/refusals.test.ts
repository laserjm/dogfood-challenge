// What the chat actions answer each module error with, and that anything else
// is rethrown as a bug. No Next: refusals.ts is plain functions.
import { describe, expect, it } from "vitest"
import * as chats from "@/modules/chats"
import { chatRefusal } from "./refusals"

describe("chatRefusal", () => {
  it("answers ChatNotFound with notFound()", () => {
    expect(chatRefusal(new chats.ChatNotFound("c1"))).toBe("notFound")
  })

  it("rethrows ToolOutputRejected as a bug, which no action's call throws", () => {
    const error = new chats.ToolOutputRejected("m1", "not the newest message")
    expect(() => chatRefusal(error)).toThrow(error)
  })

  it("rethrows what is not the module's", () => {
    const bug = new Error("boom")
    expect(() => chatRefusal(bug)).toThrow(bug)
  })
})
