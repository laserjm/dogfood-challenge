import "server-only"
import { cache } from "react"
import { asc } from "drizzle-orm"
import { db } from "./db/client"
import { usersTable } from "./db/schema"

export type SessionUser = { id: string; name: string }

// Single-user mode: the "session" is the first user. Swap this body for a
// real session lookup later; callers don't change.
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const [user] = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable)
    .orderBy(asc(usersTable.email))
    .limit(1)
  return user ?? null
})

export async function requireUser(): Promise<SessionUser> {
  const user = await getUser()
  if (!user)
    throw new Error("No user in the database. Run the seed script first.")
  return user
}

// Binds the current user to a function that takes it as `requester`.
// Modules use this in index.ts only (ADR 0001), so their internals stay
// free of request context and testable without Next.
export function withUser<A extends unknown[], R>(
  fn: (requester: SessionUser, ...args: A) => Promise<R>
) {
  return async (...args: A): Promise<R> => fn(await requireUser(), ...args)
}
