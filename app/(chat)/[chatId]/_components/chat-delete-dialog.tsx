"use client"

import { useFormStatus } from "react-dom"
import { deleteChatAction } from "@/app/(chat)/_lib/actions"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

export type ChatDeleteDialogProps = { chatId: string }

export function ChatDeleteDialog({ chatId }: ChatDeleteDialogProps) {
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
        <form action={deleteChatAction.bind(null, chatId)}>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <SubmitButton />
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// useFormStatus only reads the parent <form> from a child component, so the
// pending button stays a separate (unexported) component.
function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <AlertDialogAction type="submit" variant="destructive" disabled={pending}>
      {pending ? "Deleting…" : "Delete"}
    </AlertDialogAction>
  )
}
