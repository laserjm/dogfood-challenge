import { notFound } from "next/navigation"
import { ChatDeleteDialog } from "@/components/chat/chat-delete-dialog"
import * as chats from "@/modules/chats"
import { ChatProvider } from "@/components/chat/chat-provider"
import { ChatForm } from "@/components/chat/chat-form"
import { ChatMessageList } from "@/components/chat/chat-message-list"

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

      <ChatProvider chatId={chatId} initialMessages={chat.messages}>
        <ChatMessageList />
        <ChatForm />
      </ChatProvider>
    </div>
  )
}
