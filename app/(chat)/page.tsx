import { Button } from "@/components/ui/button"
import { createChatAction } from "./actions"

export default async function ChatsPage() {
  return (
    <>
      <div>ChatShell</div>
      <form action={createChatAction}>
        <Button type="submit">Click me</Button>
      </form>
    </>
  )
}
