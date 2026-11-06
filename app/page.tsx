import { Button } from "@/components/ui/button"
import { getChatsByUserId, getMessagesByChatId } from "./(chat)/_lib/queries"
import { DBMessage } from "@/lib/db/schema"

export default async function Page() {
  const chats = await getChatsByUserId()
  const messages = await getMessagesByChatId(chats[0].id)
  return (
    <div className="flex min-h-screen p-6">
      <div className="flex max-w-md min-w-0 flex-col gap-4 text-sm leading-loose">
        <div>
          <h1 className="font-medium">Project ready!</h1>
          <p>You may now add components and start building.</p>
          <p>We&apos;ve already added the button component for you.</p>
          <Button className="mt-2">Button</Button>
        </div>
        <div>
          <h2 className="font-medium">Chats</h2>
          <ul>
            {chats.map((chat) => (
              <li key={chat.id}>{chat.title}</li>
            ))}
          </ul>
        </div>
        <pre>{JSON.stringify(chats, null, 2)}</pre>
        <div className="font-mono text-xs text-muted-foreground">
          (Press <kbd>d</kbd> to toggle dark mode)
        </div>
        <ul>
          {messages.map((message) => (
            <li key={message.id}>
              <span className="font-medium">{message.role}</span>{" "}
              <time>{message.createdAt.toISOString()}</time>
              {message.parts.map((part, i) =>
                part.type === "text" ? <p key={i}>{part.text}</p> : null
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
