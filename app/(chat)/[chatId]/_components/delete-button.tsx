"use client"

import { useFormStatus } from "react-dom"
import { AlertDialogAction } from "@/components/ui/alert-dialog"

export function DeleteButton() {
  const { pending } = useFormStatus()
  return (
    <AlertDialogAction type="submit" variant="destructive" disabled={pending}>
      {pending ? "Deleting…" : "Delete"}
    </AlertDialogAction>
  )
}
