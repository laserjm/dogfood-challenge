import React from "react"
import { getChatsByUserId } from "./_lib/queries"

export default async function ChatShell() {
  const chats = await getChatsByUserId()
  return <div>ChatShell</div>
}
