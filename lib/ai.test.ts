import {
  GatewayAuthenticationError,
  GatewayModelNotFoundError,
  GatewayRateLimitError,
} from "@ai-sdk/gateway"
import { RetryError } from "ai"
import { describe, expect, it } from "vitest"
import { describeAiError } from "./ai"

describe("describeAiError", () => {
  it.each([
    [new GatewayAuthenticationError(), /API key/],
    [new GatewayModelNotFoundError(), /model/],
    [new GatewayRateLimitError(), /busy/],
    [new Error("socket hang up"), /couldn't answer/],
  ])("maps %o to readable copy", (error, copy) => {
    expect(describeAiError(error)).toMatch(copy)
  })

  it("looks through a RetryError to the last attempt", () => {
    const error = new RetryError({
      message: "failed after 3 attempts",
      reason: "maxRetriesExceeded",
      errors: [new GatewayRateLimitError(), new GatewayRateLimitError()],
    })
    expect(describeAiError(error)).toMatch(/busy/)
  })
})
