import { notFound } from "next/navigation"
import { ChatDeleteDialog } from "./_components/chat-delete-dialog"
import { ChatPanel } from "./_components/chat-panel"
import * as chats from "@/modules/chats"

export default async function ChatPage(props: PageProps<"/[chatId]">) {
  const { chatId } = await props.params
  const chat = await chats.getChat(chatId)
  if (!chat) notFound()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-4 py-3">
        <h1 className="truncate text-sm font-medium">{chat.title}</h1>
        {chat.canDelete && <ChatDeleteDialog chatId={chatId} />}
      </header>

      <ChatPanel chatId={chatId} initialMessages={chat.messages} />
    </div>
  )
}
