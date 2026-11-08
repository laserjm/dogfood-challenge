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

// Turns a provider error into copy the user can read. Pure, so it is unit
// testable; the real error is logged where it happens (streamText's onError).
// Single-user local app: naming the env variable is the actionable hint.
export function describeAiError(error: unknown): string {
  // Retryable errors arrive wrapped once the retries are used up.
  const cause = RetryError.isInstance(error) ? error.lastError : error

  if (GatewayAuthenticationError.isInstance(cause)) {
    return "The AI service rejected the API key. Check AI_GATEWAY_API_KEY in .env.local and restart the server."
  }
  if (GatewayModelNotFoundError.isInstance(cause)) {
    return "The configured AI model doesn't exist. Check AI_GATEWAY_MODEL in .env.local."
  }
  if (GatewayRateLimitError.isInstance(cause)) {
    return "The AI service is busy right now. Wait a moment and try again."
  }
  return "The assistant couldn't answer. Try again in a moment."
}
