// The status and copy the chat route answers with before its stream starts.
// No Next: refusals.ts is plain functions beside the route.
import { afterEach, describe, expect, it, vi } from "vitest"
import * as chats from "@/modules/chats"
import { chatRefusal, invalidRequest, thrownResponse } from "./refusals"

async function answer(response: Response) {
  return { status: response.status, body: await response.json() }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("chatRefusal", () => {
  it.each([
    [new chats.ChatNotFound("c1"), 404, "This chat doesn't exist anymore."],
    [
      new chats.ToolOutputRejected("m1", "not the newest message"),
      409,
      "This chat changed in the meantime. Reload the page and try again.",
    ],
  ])("answers %s with %i", async (error, status, copy) => {
    expect(await answer(chatRefusal(error))).toEqual({
      status,
      body: { error: copy },
    })
  })

  it("rethrows what is not the module's", () => {
    const bug = new Error("boom")
    expect(() => chatRefusal(bug)).toThrow(bug)
  })
})

describe("thrownResponse", () => {
  it("answers a chats error with its refusal", async () => {
    expect(await answer(thrownResponse(new chats.ChatNotFound("c1")))).toEqual({
      status: 404,
      body: { error: "This chat doesn't exist anymore." },
    })
  })

  it("logs anything else as a bug and answers 500", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const bug = new Error("boom")
    expect(await answer(thrownResponse(bug))).toEqual({
      status: 500,
      body: {
        error: "Something went wrong on the server. Try again in a moment.",
      },
    })
    expect(log).toHaveBeenCalledWith("[api/chat] request failed", bug)
  })
})

describe("invalidRequest", () => {
  it("answers 400 with copy that says what to do", async () => {
    expect(await answer(invalidRequest())).toEqual({
      status: 400,
      body: {
        error: "That message couldn't be sent. Reload the page and try again.",
      },
    })
  })
})
