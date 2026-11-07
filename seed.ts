import { config } from "dotenv"
import { drizzle } from "drizzle-orm/node-postgres"
import { eq, inArray } from "drizzle-orm"
import { chatsTable, messagesTable, usersTable } from "./lib/db/schema"

config({ path: ".env.local" })

const db = drizzle(process.env.DATABASE_URL!)

const SEED_EMAIL = "john@example.com"

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000)

const textMessage = (
  chatId: string,
  role: "user" | "assistant",
  text: string,
  createdAt: Date,
  position: number
): typeof messagesTable.$inferInsert => ({
  chatId,
  role,
  parts: [{ type: "text", text }],
  attachments: [],
  createdAt,
  position,
})

const chats = [
  {
    title: "Getting started with Drizzle",
    visibility: "private" as const,
    createdAt: minutesAgo(60),
    messages: [
      ["user", "What is Drizzle ORM?"],
      [
        "assistant",
        "Drizzle is a lightweight, type-safe TypeScript ORM for SQL databases.",
      ],
      ["user", "Does it work with Postgres?"],
      ["assistant", "Yes, via node-postgres, postgres.js, Neon and more."],
    ],
  },
  {
    title: "Planning a weekend trip",
    visibility: "public" as const,
    createdAt: minutesAgo(30),
    messages: [
      ["user", "Suggest a two-day itinerary for Lisbon."],
      [
        "assistant",
        "Day 1: Alfama, Castelo de S. Jorge, Fado dinner. Day 2: Belém, LX Factory, sunset at Miradouro.",
      ],
      ["user", "Any food recommendations?"],
    ],
  },
] as const

async function main() {
  // Clean up previous seed data so the script can be re-run.
  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, SEED_EMAIL))

  if (existing.length > 0) {
    const userIds = existing.map((u) => u.id)
    const oldChats = await db
      .select({ id: chatsTable.id })
      .from(chatsTable)
      .where(inArray(chatsTable.userId, userIds))

    if (oldChats.length > 0) {
      await db.delete(messagesTable).where(
        inArray(
          messagesTable.chatId,
          oldChats.map((c) => c.id)
        )
      )
      await db.delete(chatsTable).where(inArray(chatsTable.userId, userIds))
    }
    await db.delete(usersTable).where(inArray(usersTable.id, userIds))
  }

  const [user] = await db
    .insert(usersTable)
    .values({ name: "John", age: 30, email: SEED_EMAIL })
    .returning()
  console.log("User created:", user.email)

  for (const chat of chats) {
    const [created] = await db
      .insert(chatsTable)
      .values({
        title: chat.title,
        visibility: chat.visibility,
        createdAt: chat.createdAt,
        userId: user.id,
      })
      .returning()

    // Space messages one minute apart, starting at the chat's creation time.
    const rows = chat.messages.map(([role, text], i) =>
      textMessage(
        created.id,
        role,
        text,
        new Date(chat.createdAt.getTime() + i * 60_000),
        i
      )
    )
    await db.insert(messagesTable).values(rows)
    console.log(`Chat "${created.title}" created with ${rows.length} messages`)
  }

  console.log("Seeding done!")
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => process.exit())
