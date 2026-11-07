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
