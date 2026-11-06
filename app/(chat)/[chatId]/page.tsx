import { deleteChat } from "@/app/(chat)/_lib/actions"
import { getMessagesByChatId } from "@/app/(chat)/_lib/queries"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { DeleteButton } from "./_components/delete-button"

export default async function ChatPage(props: PageProps<"/[chatId]">) {
  const { chatId } = await props.params
  const messages = await getMessagesByChatId(chatId)

  return (
    <>
      <div>Chat {chatId}</div>
      {/* <form action={deleteChat.bind(null, chatId)}>
        <Button type="submit">Delete</Button>
      </form> */}
      <AlertDialog>
        <AlertDialogTrigger render={<Button variant="destructive" />}>
          Delete
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the chat and all of its messages. This
              can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form action={deleteChat.bind(null, chatId)}>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              {/* <AlertDialogAction type="submit" variant="destructive">
                Delete
              </AlertDialogAction> */}
              <DeleteButton />
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
      {messages.map((m) => (
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
