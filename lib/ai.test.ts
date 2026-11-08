import {
  GatewayAuthenticationError,
  GatewayModelNotFoundError,
  GatewayRateLimitError,
} from "@ai-sdk/gateway"
import { RetryError } from "ai"
import { describe, expect, it } from "vitest"
import { classifyAiError } from "./ai"

describe("classifyAiError", () => {
  it.each([
    [new GatewayAuthenticationError(), "auth"],
    [new GatewayModelNotFoundError(), "model-not-found"],
    [new GatewayRateLimitError(), "rate-limit"],
    [new Error("socket hang up"), "unknown"],
  ])("names %o", (error, kind) => {
    expect(classifyAiError(error)).toBe(kind)
  })

  it("looks through a RetryError to the last attempt", () => {
    const error = new RetryError({
      message: "failed after 3 attempts",
      reason: "maxRetriesExceeded",
      errors: [new GatewayRateLimitError(), new GatewayRateLimitError()],
    })
    expect(classifyAiError(error)).toBe("rate-limit")
  })
})
