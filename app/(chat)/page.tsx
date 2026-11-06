import { Button } from "@/components/ui/button"
import { createChat } from "./_lib/actions"

export default async function ChatShell() {
  return (
    <>
      <div>ChatShell</div>
      <form action={createChat}>
        <Button type="submit">Click me</Button>
      </form>
    </>
  )
}
