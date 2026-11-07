import { getChat } from "@/app/(chat)/_lib/queries"
import { notFound } from "next/navigation"
import { ChatDeleteDialog } from "./_components/chat-delete-dialog"

export default async function ChatPage(props: PageProps<"/[chatId]">) {
  const { chatId } = await props.params
  const chat = await getChat(chatId)
  if (!chat) notFound()

  return (
    <>
      <div>Chat {chatId}</div>
      {/* <form action={deleteChatAction.bind(null, chatId)}>
        <Button type="submit">Delete</Button>
      </form> */}
      {chat.canDelete && <ChatDeleteDialog chatId={chatId} />}
      {chat.messages.map((m) => (
        <div key={m.id}>
          {m.role === "user" ? "User: " : "AI: "}
          {m.parts
            .map((part) => (part.type === "text" ? part.text : ""))
            .join("")}
        </div>
      ))}
    </>
  )
}
