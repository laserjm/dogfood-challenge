// The only reader of process.env besides
// lib/db/client.ts. Parsed on import, so a missing or malformed value fails `next build` and the
import "server-only"
import { z } from "zod"

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AI_GATEWAY_API_KEY: z.string().min(1),
  AI_GATEWAY_MODEL: z.string().min(1),
})

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set")
if (!process.env.AI_GATEWAY_API_KEY)
  throw new Error("AI_GATEWAY_API_KEY is not set")
if (!process.env.AI_GATEWAY_MODEL)
  throw new Error("AI_GATEWAY_MODEL is not set")

export const env = envSchema.parse(process.env)
