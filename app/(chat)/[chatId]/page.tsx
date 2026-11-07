import { deleteChat } from "@/app/(chat)/_lib/actions"
import { getChatById } from "@/app/(chat)/_lib/queries"
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
import { notFound } from "next/navigation"

export default async function ChatPage(props: PageProps<"/[chatId]">) {
  const { chatId } = await props.params
  const chat = await getChatById(chatId)
  if (!chat) notFound()

  return (
    <>
      <div>Chat {chatId}</div>
      {/* <form action={deleteChat.bind(null, chatId)}>
        <Button type="submit">Delete</Button>
      </form> */}
      {chat.canDelete && <DeleteChat chatId={chatId} />}
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

function DeleteChat({ chatId }: { chatId: string }) {
  return (
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
            <DeleteButton />
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
