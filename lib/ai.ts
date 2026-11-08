import "server-only"
import {
  GatewayAuthenticationError,
  GatewayModelNotFoundError,
  GatewayRateLimitError,
} from "@ai-sdk/gateway"
import { createGateway, RetryError, type LanguageModel } from "ai"
import { aiEnv } from "./env"

// The one place that knows which AI provider and model the app uses. The key
// is passed explicitly, so the SDK never reads process.env behind our back.

let model: LanguageModel | undefined

export function chatModel(): LanguageModel {
  if (model === undefined) {
    const { AI_GATEWAY_API_KEY, AI_GATEWAY_MODEL } = aiEnv()
    model = createGateway({ apiKey: AI_GATEWAY_API_KEY })(AI_GATEWAY_MODEL)
  }
  return model
}

// What went wrong, named. The adapter words it: a lib client classifies errors
// and never holds copy. Pure, so it is unit testable; the real error is logged
// where it happens (streamText's onError).
export type AiErrorKind = "auth" | "model-not-found" | "rate-limit" | "unknown"

export function classifyAiError(error: unknown): AiErrorKind {
  // Retryable errors arrive wrapped once the retries are used up.
  const cause = RetryError.isInstance(error) ? error.lastError : error

  if (GatewayAuthenticationError.isInstance(cause)) return "auth"
  if (GatewayModelNotFoundError.isInstance(cause)) return "model-not-found"
  if (GatewayRateLimitError.isInstance(cause)) return "rate-limit"
  return "unknown"
}
