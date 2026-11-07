import { getChat } from "@/app/(chat)/_lib/queries"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Message, MessageContent, MessageGroup } from "@/components/ui/message"
import { notFound } from "next/navigation"
import { Streamdown } from "streamdown"
import { ChatDeleteDialog } from "./_components/chat-delete-dialog"
import ChatClientPage from "./_components/chat-page"
import { UIMessage } from "ai"

export default async function ChatPage(props: PageProps<"/[chatId]">) {
  const { chatId } = await props.params
  const chat = await getChat(chatId)
  if (!chat) notFound()

  console.dir({ databaseMessages: chat.messages }, { depth: null })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-4 py-3">
        <h1 className="truncate text-sm font-medium">{chat.title}</h1>
        {chat.canDelete && <ChatDeleteDialog chatId={chatId} />}
      </header>

      <ChatClientPage
        id={chatId}
        initialMessages={chat.messages as UIMessage[]}
      />

      {/* <div className="flex-1 overflow-y-auto">
        <MessageGroup className="mx-auto w-full max-w-3xl gap-6 px-4 py-8">
          {chat.messages.length === 0 && (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No messages yet.
            </p>
          )}
          {chat.messages.map((m) => {
            const text = m.parts
              .map((part) => (part.type === "text" ? part.text : ""))
              .join("")
            const isUser = m.role === "user"

            return (
              <Message key={m.id} align={isUser ? "end" : "start"}>
                <MessageContent>
                  {isUser ? (
                    <Bubble variant="secondary" align="end">
                      <BubbleContent className="rounded-2xl px-4 py-2.5 whitespace-pre-wrap">
                        {text}
                      </BubbleContent>
                    </Bubble>
                  ) : (
                    <Bubble variant="ghost">
                      <BubbleContent>
                        <Streamdown>{text}</Streamdown>
                      </BubbleContent>
                    </Bubble>
                  )}
                </MessageContent>
              </Message>
            )
          })}
        </MessageGroup>
      </div> */}
    </div>
  )
}
