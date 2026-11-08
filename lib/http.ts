import { z } from "zod"

// The body of every error a route handler answers with, on every status
// (CONVENTIONS.md, Errors). Typed once here, never per module. Browser-safe
// on purpose: the client parses a response body with the same schema, because
// a body is untrusted input.
export const errorBody = z.object({ error: z.string() })
export type ErrorBody = z.infer<typeof errorBody>

// `error` is copy the user can read, never a class name or a tag.
export function errorResponse(status: number, error: string) {
  return Response.json({ error } satisfies ErrorBody, { status })
}
