"use client"

import { useRef, useState } from "react"
import { ArrowUpIcon, SquareIcon } from "lucide-react"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import { useChatActions, useChatState } from "./chat-provider"

export function ChatForm() {
  const { busy } = useChatState()
  const { send, stop } = useChatActions()

  // The draft lives here, not in the provider: a keystroke re-renders this
  // form only, never the message list.
  const [text, setText] = useState("")
  const formRef = useRef<HTMLFormElement>(null)

  const canSend = text.trim().length > 0 && !busy

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSend) return
    send(text)
    setText("")
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-6">
      <form ref={formRef} onSubmit={onSubmit} autoComplete="off">
        <InputGroup>
          <InputGroupTextarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Ask the agent..."
            aria-label="Message"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                formRef.current?.requestSubmit()
              }
            }}
            className="p-3"
            name="prompt"
            autoCorrect="off"
            spellCheck={false}
            data-1p-ignore // 1Password
            data-lpignore="true" // LastPass
            data-form-type="other" // Dashlane & generic heuristics
          />
          <InputGroupAddon align="inline-end">
            {busy ? (
              <InputGroupButton
                type="button"
                size="icon-sm"
                variant="default"
                className="rounded-full"
                onClick={stop}
                aria-label="Stop"
              >
                <SquareIcon className="fill-current" />
              </InputGroupButton>
            ) : (
              <InputGroupButton
                type="submit"
                size="icon-sm"
                variant="default"
                className="rounded-full"
                disabled={!canSend}
                aria-label="Send"
              >
                <ArrowUpIcon />
              </InputGroupButton>
            )}
          </InputGroupAddon>
        </InputGroup>
      </form>
    </div>
  )
}
