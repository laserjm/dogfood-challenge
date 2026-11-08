// The only reader of process.env (Rule 9). Settings come in groups, and each
// group is parsed the first time something asks for it: the db client and the
// tests only ever need the database group. instrumentation.ts asks for every
// group when the server starts, so a missing or malformed value stops
// `next dev` / `next start` before the first request.
import "server-only"
import { z } from "zod"

const databaseSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
})

const aiSchema = z.object({
  AI_GATEWAY_API_KEY: z.string().trim().min(1),
  // Gateway model strings are "provider/model", e.g. "openai/gpt-5".
  AI_GATEWAY_MODEL: z
    .string()
    .regex(/^[\w-]+\/[\w.:-]+$/, 'expected "provider/model"'),
})

function envGroup<T extends z.ZodType>(name: string, schema: T) {
  let parsed: z.output<T> | undefined
  return (): z.output<T> => {
    if (parsed !== undefined) return parsed
    const result = schema.safeParse(process.env)
    if (!result.success) {
      throw new Error(
        `Invalid ${name} settings in the environment (see .env.example):\n` +
          z.prettifyError(result.error)
      )
    }
    parsed = result.data
    return result.data
  }
}

export const databaseEnv = envGroup("database", databaseSchema)
export const aiEnv = envGroup("AI Gateway", aiSchema)
