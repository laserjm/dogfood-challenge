import type { UIMessage } from "ai"
import {
  integer,
  json,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"

export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  name: varchar({ length: 255 }).notNull(),
  age: integer().notNull(),
  email: varchar({ length: 255 }).notNull().unique(),
})

export const chatsTable = pgTable("chats", {
  createdAt: timestamp("createdAt").notNull(),
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  title: text("title").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => usersTable.id),
  visibility: varchar("visibility", { enum: ["public", "private"] })
    .notNull()
    .default("private"),
})

export const messagesTable = pgTable("messages", {
  attachments: json("attachments").notNull(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chatsTable.id),
  createdAt: timestamp("createdAt").notNull(),
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  parts: json("parts").$type<UIMessage["parts"]>().notNull(),
  // TS-only enum: no migration, the column stays varchar.
  role: varchar("role", { enum: ["system", "user", "assistant"] }).notNull(),
  position: integer("position").notNull(), // stable order
})
