import { randomUUID } from "node:crypto"
import type { SessionUser } from "@/lib/auth"
import { db } from "@/lib/db/client"
import { chatsTable, usersTable } from "@/lib/db/schema"

// Arrange helpers: raw inserts, so a test never depends on a command it
// isn't testing. Every call makes fresh rows; tests never share data.

export async function insertUser(): Promise<SessionUser> {
  const [user] = await db
    .insert(usersTable)
    .values({ name: "Test user", age: 30, email: `${randomUUID()}@test.local` })
    .returning({ id: usersTable.id, name: usersTable.name })
  return user
}

export async function insertChat(
  owner: SessionUser,
  values: { title?: string; createdAt?: Date } = {}
) {
  const [chat] = await db
    .insert(chatsTable)
    .values({
      userId: owner.id,
      title: values.title ?? "Test chat",
      createdAt: values.createdAt ?? new Date(),
    })
    .returning({ id: chatsTable.id, title: chatsTable.title })
  return chat
}
