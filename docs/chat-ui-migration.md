# Chat UI migration: provider, compound components, tool variants

A step-by-step guide to splitting `app/(chat)/[chatId]/_components/chat-panel.tsx` (478 lines)
into a `ChatProvider` with compound children (option B) and one explicit component per tool
(option C), with the React Compiler turned on.

I ran every step as its own commit in a throwaway worktree on top of `e218d51`, and each one passed
`pnpm typecheck` and `pnpm lint`. The final state also passed `pnpm test` (31 tests) and `pnpm build`.
I did **not** click through it in the browser. The checklist in step 7 is yours.

**How to use this:** one step is one commit, and the app works after every step. After each step, run:

```bash
pnpm typecheck && pnpm lint && pnpm test
```

`pnpm lint` already warns once about `UITools` in `modules/chats/contracts.ts`. That warning was
there before and isn't part of this migration.

---

## Where we are going

```
app/(chat)/[chatId]/
├─ page.tsx                     RSC: loads the chat, lays the page out
└─ _components/
   ├─ chat-provider.tsx         the ONLY file that knows useChat
   ├─ chat-message-list.tsx     list, empty state, "Thinking", error + retry
   ├─ chat-message-row.tsx      memo: one message (user bubble or assistant steps + reply)
   ├─ chat-form.tsx             the draft and send/stop
   ├─ tool-row.tsx              ToolRow switch + one variant per tool
   ├─ reasoning-row.tsx
   ├─ chat-parts.ts             part types + pure helpers (textOf, isStepPart)
   └─ chat-delete-dialog.tsx    unchanged
```

```
ChatPage (server)
├─ <header> title + ChatDeleteDialog
└─ ChatProvider ('use client')
   │  ChatActionsContext  { send, stop, retry, answerConfirmation }   built once
   │  ChatStateContext    { messages, status, error, busy }           every chunk
   ├─ ChatMessageList ── state + retry
   │  └─ memo(ChatMessageRow) ── props only; only the streaming row re-renders
   │     ├─ ReasoningRow
   │     └─ ToolRow → WeatherToolRow | LocationToolRow | ConfirmationToolRow
   │                    └─ ToolStatusRow (shared lifecycle)      answerConfirmation ↑
   └─ ChatForm ── busy + send/stop; the draft is its own state
```

Which Vercel rule each piece follows:

| Change | Rule |
|---|---|
| `useChat` only inside `ChatProvider` | `state-decouple-implementation` |
| `{ state }` + `{ actions }` as the context's API | `state-context-interface` |
| Siblings (list, form, tool rows) share state via the provider | `state-lift-state`, `architecture-compound-components` |
| `use(Context)`, `<Context value>` | `react19-no-forwardref` (React 19 APIs) |
| Draft in `ChatForm`, not above the list | `rerender-defer-reads` |
| `memo(ChatMessageRow)` | `rerender-memo` |
| Transport and `generateId` at module scope | `advanced-init-once`, `rendering-hoist-jsx` |
| One component per tool, no `describeTool` switch | `patterns-explicit-variants`, `architecture-avoid-boolean-props` |
| `cond ? <X/> : null` | `rendering-conditional-render` |

---

## Step 0: start clean

Your working tree still has the deletion of `fake-chat.tsx`. Commit it first so the migration
diffs contain only the migration:

```bash
git add -A "app/(chat)/[chatId]/_components/fake-chat.tsx"
git commit -m "chore: drop fake chat"
pnpm typecheck && pnpm lint && pnpm test   # baseline: green, 1 known warning
```

---

## Step 1: turn on the React Compiler

Next 16 runs the compiler through `babel-plugin-react-compiler`, but only on files with JSX or
hooks, so the build gets only slightly slower (see `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/reactCompiler.md`).

```bash
pnpm add -D babel-plugin-react-compiler
```

`next.config.ts`:

```ts
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  reactCompiler: true,
}

export default nextConfig
```

**Already in place:** `eslint-config-next` turns on `eslint-plugin-react-hooks` v7's recommended rules,
which include the compiler's checks (`purity`, `refs`, `immutability`, …). That rule is why
`pickCity` sits outside the component. So `pnpm lint` already tells you when code would make the
compiler skip a component.

**Check:** run `pnpm build`. In the browser, React DevTools → Components shows a "Memo ✨" badge on
compiled components.

> Optional: `experimental.turbopackRustReactCompiler: true` uses the native Rust port. It's experimental,
> so leave it off for now.

Commit: `build: enable React Compiler`

---

## Step 2: move the part types and pure helpers into `chat-parts.ts`

This only moves code; nothing behaves differently. Doing it first means later files can share these types without
importing each other in a circle (row ↔ tool row).

**New file** `_components/chat-parts.ts`:

```ts
import { isStaticToolUIPart } from "ai"
import type { ChatMessage } from "@/modules/chats/contracts"

// UI-side views of a message's parts. Derived from ChatMessage, so a new tool
// in contracts.ts shows up here without an edit.
export type ChatPart = ChatMessage["parts"][number]
export type ToolPart = Extract<
  ChatPart,
  { toolCallId: string; type: `tool-${string}` }
>
export type ReasoningPart = Extract<ChatPart, { type: "reasoning" }>
export type StepPart = ToolPart | ReasoningPart

export function isStepPart(part: ChatPart): part is StepPart {
  return part.type === "reasoning" || isStaticToolUIPart(part)
}

// Text parts of one message; steps between them are separate paragraphs.
export function textOf(message: ChatMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n\n")
}
```

**In `chat-panel.tsx`:** delete the four `type` aliases at the top and the `isStepPart` / `textOf`
functions at the bottom, then import them:

```diff
@@ -45,12 +45,6 @@ import {
   TraceTitle,
 } from "@/components/ui/trace"
+import { isStepPart, textOf, type StepPart, type ToolPart } from "./chat-parts"
 
-type ChatPart = ChatMessage["parts"][number]
-type ToolPart = Extract<
-  ChatPart,
-  { toolCallId: string; type: `tool-${string}` }
->
-type ReasoningPart = Extract<ChatPart, { type: "reasoning" }>
-type StepPart = ToolPart | ReasoningPart
 type AddToolOutput = ReturnType<typeof useChat<ChatMessage>>["addToolOutput"]
 
@@ -446,16 +440,4 @@ function describeTool(part: ToolPart) {
 }
 
-function isStepPart(part: ChatPart): part is StepPart {
-  return part.type === "reasoning" || isStaticToolUIPart(part)
-}
-
-// Text parts of one message; steps between them are separate paragraphs.
-function textOf(message: ChatMessage): string {
-  return message.parts
-    .filter((part) => part.type === "text")
-    .map((part) => part.text)
-    .join("\n\n")
-}
-
 // Stand-in for a real location lookup. Outside the component, because the
 // React Compiler treats Math.random inside it as an impure render.
```

Commit: `refactor(chat): extract part types and helpers`

---

## Step 3: add `ChatProvider` and move `useChat` into it

This is the core step. After it, nothing but the provider knows about `@ai-sdk/react`.

Decisions worth knowing:

- **Two contexts.** `messages` changes with every streamed chunk, and the actions never change. A
  consumer that only needs `send` (a future "new chat" or "stop" button in the header) doesn't
  re-render while a reply streams.
- **The actions are this app's own verbs** (`send(text)`, `retry()`, `answerConfirmation(id, yes)`),
  not the SDK's `sendMessage({ text })` or `addToolOutput({...})`. The output strings for the
  confirmation tool now live in one place.
- **`busy` is derived in the provider**, once, instead of in every consumer.
- **No `useMemo`.** The compiler caches `state` on `messages/status/error` and `actions` on
  `useChat`'s methods. Those methods belong to the `Chat` instance, which `useChat` creates once
  per `id`, so `actions` is built exactly once per chat. (I checked this in the compiler's output.)
- **The transport is at module scope.** `useChat` reads the transport through a ref on every
  request, so the old per-render `new DefaultChatTransport(...)` worked, but it allocated an object
  on every render. The transport holds config only, no request state, so sharing it is safe even
  during SSR (`server-no-shared-module-state` isn't violated).

**New file** `_components/chat-provider.tsx`:

```tsx
"use client"

import { useChat } from "@ai-sdk/react"
import {
  DefaultChatTransport,
  isStaticToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
  type ChatStatus,
} from "ai"
import { createContext, use } from "react"
import type { ChatMessage } from "@/modules/chats/contracts"

// The only file that knows the chat runs on useChat. Everything below the
// provider reads these two contexts and never imports @ai-sdk/react.

export type ChatState = {
  messages: ChatMessage[]
  status: ChatStatus
  error: Error | undefined
  // "error" is not busy: the user must be able to retry or type again.
  busy: boolean
}

export type ChatActions = {
  send: (text: string) => void
  stop: () => void
  retry: () => void
  answerConfirmation: (toolCallId: string, confirmed: boolean) => void
}

// Two contexts: state changes with every streamed chunk, actions never do.
// A component that only sends or stops doesn't re-render while streaming.
const ChatStateContext = createContext<ChatState | null>(null)
const ChatActionsContext = createContext<ChatActions | null>(null)

export function useChatState(): ChatState {
  const state = use(ChatStateContext)
  if (!state) throw new Error("useChatState must be used inside <ChatProvider>")
  return state
}

export function useChatActions(): ChatActions {
  const actions = use(ChatActionsContext)
  if (!actions) {
    throw new Error("useChatActions must be used inside <ChatProvider>")
  }
  return actions
}

// Built once per page load: it closes over nothing from the component.
// Holds no request state, so sharing it during SSR is safe.
const transport = new DefaultChatTransport<ChatMessage>({
  api: "/api/chat",
  // Send only what is new; the server loads the history from the db.
  prepareSendMessagesRequest: ({ id, messages }) => {
    const last = messages.at(-1)
    // An automatic resend after addToolOutput: the newest message is the
    // assistant's, and what's new are the tool outputs on it.
    if (last?.role === "assistant") {
      return {
        body: {
          type: "tool-outputs",
          chatId: id,
          messageId: last.id,
          outputs: last.parts
            .filter(isStaticToolUIPart)
            .filter((part) => part.state === "output-available")
            .map((part) => ({
              toolCallId: part.toolCallId,
              output: part.output,
            })),
        },
      }
    }
    return { body: { type: "message", chatId: id, message: last } }
  },
})

const generateId = () => crypto.randomUUID()

export type ChatProviderProps = {
  chatId: string
  initialMessages: ChatMessage[]
  children: React.ReactNode
}

export function ChatProvider({
  chatId,
  initialMessages,
  children,
}: ChatProviderProps) {
  const {
    messages,
    status,
    error,
    sendMessage,
    regenerate,
    stop,
    addToolOutput,
  } = useChat<ChatMessage>({
    id: chatId,
    messages: initialMessages,
    generateId,
    transport,
    onError: (error) => {
      console.error("[client] chat error", error)
    },
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    // Client-side tools that run without asking the user.
    async onToolCall({ toolCall }) {
      if (toolCall.dynamic) return
      if (toolCall.toolName === "getLocation") {
        // No await: avoids a deadlock with the automatic resend.
        addToolOutput({
          tool: "getLocation",
          toolCallId: toolCall.toolCallId,
          output: pickCity(),
        })
      }
    },
  })

  // No useMemo: the React Compiler memoizes both objects on their inputs.
  // useChat's methods are stable per chat, so `actions` is built once.
  const state: ChatState = {
    messages,
    status,
    error,
    busy: status === "submitted" || status === "streaming",
  }

  const actions: ChatActions = {
    send: (text) => sendMessage({ text }),
    stop: () => stop(),
    // Resends the last user message with the same id: the server stores it
    // once (onConflictDoNothing), so no duplicate.
    retry: () => regenerate(),
    answerConfirmation: (toolCallId, confirmed) =>
      addToolOutput({
        tool: "askForConfirmation",
        toolCallId,
        output: confirmed ? "Yes, confirmed." : "No, denied",
      }),
  }

  return (
    <ChatActionsContext value={actions}>
      <ChatStateContext value={state}>{children}</ChatStateContext>
    </ChatActionsContext>
  )
}

// Stand-in for a real location lookup. Outside the component, because the
// React Compiler treats Math.random inside it as an impure render.
const CITIES = ["New York", "Los Angeles", "Chicago", "San Francisco"]
const pickCity = () => CITIES[Math.floor(Math.random() * CITIES.length)]
```

**In `chat-panel.tsx`:** the `useChat(...)` block, the transport, `pickCity` and the
`AddToolOutput` type all leave. The panel reads the two hooks instead, and `ConfirmationRow`
gets `answerConfirmation` from context instead of from a prop passed down two levels:

```diff
@@ -1,11 +1,5 @@
 "use client"
 
-import { chatErrorResponse, type ChatMessage } from "@/modules/chats/contracts"
-import { useChat } from "@ai-sdk/react"
-import {
-  DefaultChatTransport,
-  isStaticToolUIPart,
-  lastAssistantMessageIsCompleteWithToolCalls,
-} from "ai"
+import { chatErrorResponse } from "@/modules/chats/contracts"
 import { useRef, useState } from "react"
 import { Streamdown } from "streamdown"
@@ -46,74 +40,13 @@ import {
 } from "@/components/ui/trace"
 import { isStepPart, textOf, type StepPart, type ToolPart } from "./chat-parts"
+import { useChatActions, useChatState } from "./chat-provider"
 
-type AddToolOutput = ReturnType<typeof useChat<ChatMessage>>["addToolOutput"]
-
-export type ChatPanelProps = {
-  chatId: string
-  initialMessages: ChatMessage[]
-}
-
-export function ChatPanel({ chatId, initialMessages }: ChatPanelProps) {
-  const {
-    messages,
-    sendMessage,
-    regenerate,
-    addToolOutput,
-    status,
-    stop,
-    error,
-  } = useChat({
-    id: chatId,
-    messages: initialMessages,
-    generateId: () => crypto.randomUUID(),
-    transport: new DefaultChatTransport({
-      api: "/api/chat",
-      // Send only what is new; the server loads the history from the db.
-      prepareSendMessagesRequest: ({ id, messages }) => {
-        const last = messages.at(-1)
-        // An automatic resend after addToolOutput: the newest message is the
-        // assistant's, and what's new are the tool outputs on it.
-        if (last?.role === "assistant") {
-          return {
-            body: {
-              type: "tool-outputs",
-              chatId: id,
-              messageId: last.id,
-              outputs: last.parts
-                .filter(isStaticToolUIPart)
-                .filter((part) => part.state === "output-available")
-                .map((part) => ({
-                  toolCallId: part.toolCallId,
-                  output: part.output,
-                })),
-            },
-          }
-        }
-        return { body: { type: "message", chatId: id, message: last } }
-      },
-    }),
-    onError: (error) => {
-      console.error("[client] chat error", error)
-    },
-    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
-    // Client-side tools that run without asking the user.
-    async onToolCall({ toolCall }) {
-      if (toolCall.dynamic) return
-      if (toolCall.toolName === "getLocation") {
-        // No await: avoids a deadlock with the automatic resend.
-        addToolOutput({
-          tool: "getLocation",
-          toolCallId: toolCall.toolCallId,
-          output: pickCity(),
-        })
-      }
-    },
-  })
+export function ChatPanel() {
+  const { messages, status, error, busy } = useChatState()
+  const { send, stop, retry } = useChatActions()
 
   const [text, setText] = useState("")
   const formRef = useRef<HTMLFormElement>(null)
 
-  // "error" is not busy: the user must be able to retry or type again.
-  const busy = status === "submitted" || status === "streaming"
   const canSend = text.trim().length > 0 && !busy
 
@@ -121,5 +54,5 @@ export function ChatPanel({ chatId, initialMessages }: ChatPanelProps) {
     event.preventDefault()
     if (!canSend) return
-    sendMessage({ text })
+    send(text)
     setText("")
   }
@@ -172,5 +105,4 @@ export function ChatPanel({ chatId, initialMessages }: ChatPanelProps) {
                           part={part}
                           streaming={streaming}
-                          addToolOutput={addToolOutput}
                         />
                       ))}
@@ -209,12 +141,5 @@ export function ChatPanel({ chatId, initialMessages }: ChatPanelProps) {
             >
               <p>{readableError(error)}</p>
-              {/* Resends the last user message with the same id: the server
-                  stores it once (onConflictDoNothing), so no duplicate. */}
-              <Button
-                type="button"
-                variant="outline"
-                size="sm"
-                onClick={() => regenerate()}
-              >
+              <Button type="button" variant="outline" size="sm" onClick={retry}>
                 Try again
               </Button>
@@ -253,5 +178,5 @@ export function ChatPanel({ chatId, initialMessages }: ChatPanelProps) {
                   variant="default"
                   className="rounded-full"
-                  onClick={() => stop()}
+                  onClick={stop}
                   aria-label="Stop"
                 >
@@ -278,13 +203,5 @@ export function ChatPanel({ chatId, initialMessages }: ChatPanelProps) {
 }
 
-function StepRow({
-  part,
-  streaming,
-  addToolOutput,
-}: {
-  part: StepPart
-  streaming: boolean
-  addToolOutput: AddToolOutput
-}) {
+function StepRow({ part, streaming }: { part: StepPart; streaming: boolean }) {
   if (part.type === "reasoning") {
     return (
@@ -296,5 +213,5 @@ function StepRow({
     part.state === "input-available"
   ) {
-    return <ConfirmationRow part={part} addToolOutput={addToolOutput} />
+    return <ConfirmationRow part={part} />
   }
   return <ToolRow part={part} streaming={streaming} />
@@ -328,15 +245,8 @@ function ReasoningRow({ text, running }: { text: string; running: boolean }) {
 function ConfirmationRow({
   part,
-  addToolOutput,
 }: {
   part: Extract<ToolPart, { type: "tool-askForConfirmation" }>
-  addToolOutput: AddToolOutput
 }) {
-  const answer = (output: string) =>
-    addToolOutput({
-      tool: "askForConfirmation",
-      toolCallId: part.toolCallId,
-      output,
-    })
+  const { answerConfirmation } = useChatActions()
 
   return (
@@ -349,5 +259,8 @@ function ConfirmationRow({
       </TraceLine>
       <div className="flex gap-2">
-        <Button size="sm" onClick={() => answer("Yes, confirmed.")}>
+        <Button
+          size="sm"
+          onClick={() => answerConfirmation(part.toolCallId, true)}
+        >
           Yes
         </Button>
@@ -355,5 +268,5 @@ function ConfirmationRow({
           size="sm"
           variant="outline"
-          onClick={() => answer("No, denied")}
+          onClick={() => answerConfirmation(part.toolCallId, false)}
         >
           No
@@ -440,9 +353,4 @@ function describeTool(part: ToolPart) {
 }
 
-// Stand-in for a real location lookup. Outside the component, because the
-// React Compiler treats Math.random inside it as an impure render.
-const CITIES = ["New York", "Los Angeles", "Chicago", "San Francisco"]
-const pickCity = () => CITIES[Math.floor(Math.random() * CITIES.length)]
-
 const FALLBACK = "Something went wrong. Try again in a moment."
```

**In `page.tsx`:** wrap the panel:

```diff
@@ -2,4 +2,5 @@ import { notFound } from "next/navigation"
 import { ChatDeleteDialog } from "./_components/chat-delete-dialog"
 import { ChatPanel } from "./_components/chat-panel"
+import { ChatProvider } from "./_components/chat-provider"
 import * as chats from "@/modules/chats"
 
@@ -16,5 +17,7 @@ export default async function ChatPage(props: PageProps<"/[chatId]">) {
       </header>
 
-      <ChatPanel chatId={chatId} initialMessages={chat.messages} />
+      <ChatProvider chatId={chatId} initialMessages={chat.messages}>
+        <ChatPanel />
+      </ChatProvider>
 
       {/* <div className="flex-1 overflow-y-auto">
```

Commit: `refactor(chat): move useChat into ChatProvider`

---

## Step 4: extract `ChatForm` so the draft stops re-rendering the list

Today every keystroke sets `text` in the component that also renders all messages, so the whole list
re-renders per key. Moving the draft into the form fixes that structurally; it doesn't depend on
memoization.

**New file** `_components/chat-form.tsx`:

```tsx
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
```

**In `chat-panel.tsx`:** delete `text`, `formRef`, `canSend`, `onSubmit`, the whole form `<div>` and
the now-unused imports:

```diff
@@ -2,8 +2,7 @@
 
 import { chatErrorResponse } from "@/modules/chats/contracts"
-import { useRef, useState } from "react"
+import { useState } from "react"
 import { Streamdown } from "streamdown"
 import {
-  ArrowUpIcon,
   CircleCheckIcon,
   CircleHelpIcon,
@@ -12,12 +11,5 @@ import {
   MapPinIcon,
   MessageCircleDashedIcon,
-  SquareIcon,
 } from "lucide-react"
-import {
-  InputGroup,
-  InputGroupAddon,
-  InputGroupButton,
-  InputGroupTextarea,
-} from "@/components/ui/input-group"
 import { Message, MessageContent, MessageGroup } from "@/components/ui/message"
 import { Bubble, BubbleContent } from "@/components/ui/bubble"
@@ -44,17 +36,5 @@ import { useChatActions, useChatState } from "./chat-provider"
 export function ChatPanel() {
   const { messages, status, error, busy } = useChatState()
-  const { send, stop, retry } = useChatActions()
-
-  const [text, setText] = useState("")
-  const formRef = useRef<HTMLFormElement>(null)
-
-  const canSend = text.trim().length > 0 && !busy
-
-  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
-    event.preventDefault()
-    if (!canSend) return
-    send(text)
-    setText("")
-  }
+  const { retry } = useChatActions()
 
   return (
@@ -148,55 +128,4 @@ export function ChatPanel() {
         </MessageGroup>
       </div>
-
-      <div className="mx-auto w-full max-w-3xl px-4 pb-6">
-        <form ref={formRef} onSubmit={onSubmit} autoComplete="off">
-          <InputGroup>
-            <InputGroupTextarea
-              value={text}
-              onChange={(event) => setText(event.target.value)}
-              placeholder="Ask the agent..."
-              aria-label="Message"
-              onKeyDown={(event) => {
-                if (event.key === "Enter" && !event.shiftKey) {
-                  event.preventDefault()
-                  formRef.current?.requestSubmit()
-                }
-              }}
-              className="p-3"
-              name="prompt"
-              autoCorrect="off"
-              spellCheck={false}
-              data-1p-ignore // 1Password
-              data-lpignore="true" // LastPass
-              data-form-type="other" // Dashlane & generic heuristics
-            />
-            <InputGroupAddon align="inline-end">
-              {busy ? (
-                <InputGroupButton
-                  type="button"
-                  size="icon-sm"
-                  variant="default"
-                  className="rounded-full"
-                  onClick={stop}
-                  aria-label="Stop"
-                >
-                  <SquareIcon className="fill-current" />
-                </InputGroupButton>
-              ) : (
-                <InputGroupButton
-                  type="submit"
-                  size="icon-sm"
-                  variant="default"
-                  className="rounded-full"
-                  disabled={!canSend}
-                  aria-label="Send"
-                >
-                  <ArrowUpIcon />
-                </InputGroupButton>
-              )}
-            </InputGroupAddon>
-          </InputGroup>
-        </form>
-      </div>
     </>
   )
```

**In `page.tsx`:**

```diff
@@ -1,4 +1,5 @@
 import { notFound } from "next/navigation"
 import { ChatDeleteDialog } from "./_components/chat-delete-dialog"
+import { ChatForm } from "./_components/chat-form"
 import { ChatPanel } from "./_components/chat-panel"
 import { ChatProvider } from "./_components/chat-provider"
@@ -19,4 +20,5 @@ export default async function ChatPage(props: PageProps<"/[chatId]">) {
       <ChatProvider chatId={chatId} initialMessages={chat.messages}>
         <ChatPanel />
+        <ChatForm />
       </ChatProvider>
```

**Check:** React DevTools → Profiler → turn on "Highlight updates when components render" and
type. Only the form flashes. (`ChatForm` still renders on every streamed chunk because it reads
the state context for `busy`. The compiler caches its JSX, so that costs a few comparisons.)

Commit: `refactor(chat): extract ChatForm`

---

## Step 5: one component per tool (option C)

`ToolRow` + `describeTool` become explicit variants. The lifecycle that is the same for every tool
(done, failed, denied, waiting, stopped) stays in one internal `ToolStatusRow`; each variant only
supplies an icon and its text.

**Why a `switch` and not a `Record<type, Component>` map:** indexing the map with `part.type`
gives a union of components that TypeScript can't call with `part` without an `as` cast, and
Rule 8 forbids that cast. With the switch, each case narrows `part`, and the
`: React.ReactElement` return type makes it exhaustive. I tested it: removing one `case`
fails typecheck with `TS2366: Function lacks ending return statement…`. So a new tool in
`contracts.ts` without a row breaks the build. That's what you want.

**New file** `_components/reasoning-row.tsx` (moved as-is, now exported with a props type):

```tsx
"use client"

import { useState } from "react"
import { CircleCheckIcon, LoaderCircleIcon } from "lucide-react"
import {
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace"

export type ReasoningRowProps = { text: string; running: boolean }

export function ReasoningRow({ text, running }: ReasoningRowProps) {
  // undefined until the user toggles it: follows `running` until then.
  const [open, setOpen] = useState<boolean>()

  return (
    <TraceCollapsible open={open ?? running} onOpenChange={setOpen}>
      <TraceCollapsibleTrigger>
        <TraceLine status={running ? "running" : undefined}>
          <TraceIcon>
            {running ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <CircleCheckIcon />
            )}
          </TraceIcon>
          <TraceTitle>{running ? "Thinking" : "Thought"}</TraceTitle>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent className="whitespace-pre-wrap">
        {text}
      </TraceCollapsibleContent>
    </TraceCollapsible>
  )
}
```

**New file** `_components/tool-row.tsx`:

```tsx
"use client"

import { CircleHelpIcon, CloudSunIcon, MapPinIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace"
import type { ToolPart } from "./chat-parts"
import { useChatActions } from "./chat-provider"

type ToolPartOf<T extends ToolPart["type"]> = Extract<ToolPart, { type: T }>
type ToolVariantProps<T extends ToolPart["type"]> = {
  part: ToolPartOf<T>
  streaming: boolean
}

export type ToolRowProps = { part: ToolPart; streaming: boolean }

// One explicit variant per tool. The return type makes the switch exhaustive:
// a tool added to contracts.ts without a case here fails typecheck.
export function ToolRow({ part, streaming }: ToolRowProps): React.ReactElement {
  switch (part.type) {
    case "tool-getWeatherInformation":
      return <WeatherToolRow part={part} streaming={streaming} />
    case "tool-getLocation":
      return <LocationToolRow part={part} streaming={streaming} />
    case "tool-askForConfirmation":
      return <ConfirmationToolRow part={part} streaming={streaming} />
  }
}

function WeatherToolRow({
  part,
  streaming,
}: ToolVariantProps<"tool-getWeatherInformation">) {
  const city = part.input?.city ?? "…"
  return (
    <ToolStatusRow
      part={part}
      streaming={streaming}
      icon={<CloudSunIcon />}
      running={`Checking the weather in ${city}`}
      done={`Checked the weather in ${city}`}
    />
  )
}

function LocationToolRow({
  part,
  streaming,
}: ToolVariantProps<"tool-getLocation">) {
  return (
    <ToolStatusRow
      part={part}
      streaming={streaming}
      icon={<MapPinIcon />}
      running="Getting your location"
      done="Got your location"
    />
  )
}

function ConfirmationToolRow({
  part,
  streaming,
}: ToolVariantProps<"tool-askForConfirmation">) {
  const { answerConfirmation } = useChatActions()
  const message = part.input?.message

  if (part.state !== "input-available") {
    return (
      <ToolStatusRow
        part={part}
        streaming={streaming}
        icon={<CircleHelpIcon />}
        running={message ?? "Asking for confirmation"}
        done={message ?? "Asked for confirmation"}
      />
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <TraceLine status="pending">
        <TraceIcon>
          <CircleHelpIcon />
        </TraceIcon>
        <TraceTitle>{message}</TraceTitle>
      </TraceLine>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => answerConfirmation(part.toolCallId, true)}
        >
          Yes
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => answerConfirmation(part.toolCallId, false)}
        >
          No
        </Button>
      </div>
    </div>
  )
}

type ToolStatusRowProps = {
  part: ToolPart
  streaming: boolean
  icon: React.ReactNode
  running: string
  done: string
}

// The lifecycle every tool shares; the variants above only supply copy and
// an icon.
function ToolStatusRow({
  part,
  streaming,
  icon,
  running,
  done,
}: ToolStatusRowProps) {
  if (part.state === "output-available" || part.state === "output-error") {
    const failed = part.state === "output-error"
    return (
      <TraceCollapsible>
        <TraceCollapsibleTrigger>
          <TraceLine status={failed ? "error" : undefined}>
            <TraceIcon>{icon}</TraceIcon>
            <TraceTitle>{failed ? `Failed: ${running}` : done}</TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent className="whitespace-pre-wrap">
          {failed ? part.errorText : part.output}
        </TraceCollapsibleContent>
      </TraceCollapsible>
    )
  }

  if (part.state === "output-denied") {
    return (
      <TraceLine status="error">
        <TraceIcon>{icon}</TraceIcon>
        <TraceTitle>Denied: {running}</TraceTitle>
      </TraceLine>
    )
  }

  if (
    part.state === "approval-requested" ||
    part.state === "approval-responded"
  ) {
    return (
      <TraceLine status="pending">
        <TraceIcon>{icon}</TraceIcon>
        <TraceTitle>Waiting for approval: {running}</TraceTitle>
      </TraceLine>
    )
  }

  // input-streaming / input-available: still running, or the stream was
  // stopped before the tool answered.
  return (
    <TraceLine status={streaming ? "running" : "error"}>
      <TraceIcon>{icon}</TraceIcon>
      <TraceTitle>{streaming ? running : `Stopped: ${running}`}</TraceTitle>
    </TraceLine>
  )
}
```

**In `chat-panel.tsx`:** `StepRow` shrinks to a two-way choice; `ReasoningRow`, `ConfirmationRow`,
`ToolRow` and `describeTool` are deleted, along with their imports:

```diff
@@ -2,14 +2,6 @@
 
 import { chatErrorResponse } from "@/modules/chats/contracts"
-import { useState } from "react"
 import { Streamdown } from "streamdown"
-import {
-  CircleCheckIcon,
-  CircleHelpIcon,
-  CloudSunIcon,
-  LoaderCircleIcon,
-  MapPinIcon,
-  MessageCircleDashedIcon,
-} from "lucide-react"
+import { LoaderCircleIcon, MessageCircleDashedIcon } from "lucide-react"
 import { Message, MessageContent, MessageGroup } from "@/components/ui/message"
 import { Bubble, BubbleContent } from "@/components/ui/bubble"
@@ -22,15 +14,9 @@ import {
   EmptyTitle,
 } from "@/components/ui/empty"
-import {
-  Trace,
-  TraceCollapsible,
-  TraceCollapsibleContent,
-  TraceCollapsibleTrigger,
-  TraceIcon,
-  TraceLine,
-  TraceTitle,
-} from "@/components/ui/trace"
-import { isStepPart, textOf, type StepPart, type ToolPart } from "./chat-parts"
+import { Trace, TraceIcon, TraceLine, TraceTitle } from "@/components/ui/trace"
+import { isStepPart, textOf, type StepPart } from "./chat-parts"
 import { useChatActions, useChatState } from "./chat-provider"
+import { ReasoningRow } from "./reasoning-row"
+import { ToolRow } from "./tool-row"
 
 export function ChatPanel() {
@@ -133,153 +119,11 @@ export function ChatPanel() {
 
 function StepRow({ part, streaming }: { part: StepPart; streaming: boolean }) {
-  if (part.type === "reasoning") {
-    return (
-      <ReasoningRow text={part.text} running={part.state === "streaming"} />
-    )
-  }
-  if (
-    part.type === "tool-askForConfirmation" &&
-    part.state === "input-available"
-  ) {
-    return <ConfirmationRow part={part} />
-  }
-  return <ToolRow part={part} streaming={streaming} />
-}
-
-function ReasoningRow({ text, running }: { text: string; running: boolean }) {
-  // undefined until the user toggles it: follows `running` until then.
-  const [open, setOpen] = useState<boolean>()
-
-  return (
-    <TraceCollapsible open={open ?? running} onOpenChange={setOpen}>
-      <TraceCollapsibleTrigger>
-        <TraceLine status={running ? "running" : undefined}>
-          <TraceIcon>
-            {running ? (
-              <LoaderCircleIcon className="animate-spin" />
-            ) : (
-              <CircleCheckIcon />
-            )}
-          </TraceIcon>
-          <TraceTitle>{running ? "Thinking" : "Thought"}</TraceTitle>
-        </TraceLine>
-      </TraceCollapsibleTrigger>
-      <TraceCollapsibleContent className="whitespace-pre-wrap">
-        {text}
-      </TraceCollapsibleContent>
-    </TraceCollapsible>
-  )
-}
-
-function ConfirmationRow({
-  part,
-}: {
-  part: Extract<ToolPart, { type: "tool-askForConfirmation" }>
-}) {
-  const { answerConfirmation } = useChatActions()
-
-  return (
-    <div className="flex flex-col gap-2">
-      <TraceLine status="pending">
-        <TraceIcon>
-          <CircleHelpIcon />
-        </TraceIcon>
-        <TraceTitle>{part.input?.message}</TraceTitle>
-      </TraceLine>
-      <div className="flex gap-2">
-        <Button
-          size="sm"
-          onClick={() => answerConfirmation(part.toolCallId, true)}
-        >
-          Yes
-        </Button>
-        <Button
-          size="sm"
-          variant="outline"
-          onClick={() => answerConfirmation(part.toolCallId, false)}
-        >
-          No
-        </Button>
-      </div>
-    </div>
+  return part.type === "reasoning" ? (
+    <ReasoningRow text={part.text} running={part.state === "streaming"} />
+  ) : (
+    <ToolRow part={part} streaming={streaming} />
   )
 }
 
-function ToolRow({ part, streaming }: { part: ToolPart; streaming: boolean }) {
-  const { icon, running, done } = describeTool(part)
-
-  if (part.state === "output-available" || part.state === "output-error") {
-    const failed = part.state === "output-error"
-    return (
-      <TraceCollapsible>
-        <TraceCollapsibleTrigger>
-          <TraceLine status={failed ? "error" : undefined}>
-            <TraceIcon>{icon}</TraceIcon>
-            <TraceTitle>{failed ? `Failed: ${running}` : done}</TraceTitle>
-          </TraceLine>
-        </TraceCollapsibleTrigger>
-        <TraceCollapsibleContent className="whitespace-pre-wrap">
-          {failed ? part.errorText : part.output}
-        </TraceCollapsibleContent>
-      </TraceCollapsible>
-    )
-  }
-
-  if (part.state === "output-denied") {
-    return (
-      <TraceLine status="error">
-        <TraceIcon>{icon}</TraceIcon>
-        <TraceTitle>Denied: {running}</TraceTitle>
-      </TraceLine>
-    )
-  }
-
-  if (
-    part.state === "approval-requested" ||
-    part.state === "approval-responded"
-  ) {
-    return (
-      <TraceLine status="pending">
-        <TraceIcon>{icon}</TraceIcon>
-        <TraceTitle>Waiting for approval: {running}</TraceTitle>
-      </TraceLine>
-    )
-  }
-
-  // input-streaming / input-available: still running, or the stream was
-  // stopped before the tool answered.
-  return (
-    <TraceLine status={streaming ? "running" : "error"}>
-      <TraceIcon>{icon}</TraceIcon>
-      <TraceTitle>{streaming ? running : `Stopped: ${running}`}</TraceTitle>
-    </TraceLine>
-  )
-}
-
-function describeTool(part: ToolPart) {
-  switch (part.type) {
-    case "tool-getWeatherInformation": {
-      const city = part.input?.city ?? "…"
-      return {
-        icon: <CloudSunIcon />,
-        running: `Checking the weather in ${city}`,
-        done: `Checked the weather in ${city}`,
-      }
-    }
-    case "tool-getLocation":
-      return {
-        icon: <MapPinIcon />,
-        running: "Getting your location",
-        done: "Got your location",
-      }
-    case "tool-askForConfirmation":
-      return {
-        icon: <CircleHelpIcon />,
-        running: part.input?.message ?? "Asking for confirmation",
-        done: part.input?.message ?? "Asked for confirmation",
-      }
-  }
-}
-
 const FALLBACK = "Something went wrong. Try again in a moment."
```

**Try it:** comment out the `"tool-getLocation"` case and run `pnpm typecheck`. It fails. Put the
case back.

Commit: `refactor(chat): explicit tool row variants`

---

## Step 6: `ChatMessageRow` + `ChatMessageList`, then delete `ChatPanel`

This is the last split. The list owns what surrounds the messages (empty state, "Thinking", error),
and the row renders one message.

**Why `memo` is still needed with the compiler on:** the compiler caches the result of
`messages.map(...)` as a whole. When `messages` changes, which happens on every chunk, the
callback runs for every item and creates new row elements. You can see this in the compiled output. `memo` is what lets
the rows that didn't change skip rendering. It works because `useChat` replaces only the
streaming message object (`replaceMessage` slices the others through unchanged), so `message`
and `streaming` stay the same for every other row.

**New file** `_components/chat-message-row.tsx`:

```tsx
"use client"

import { memo } from "react"
import { Streamdown } from "streamdown"
import type { ChatMessage } from "@/modules/chats/contracts"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Message, MessageContent } from "@/components/ui/message"
import { Trace } from "@/components/ui/trace"
import { isStepPart, textOf } from "./chat-parts"
import { ReasoningRow } from "./reasoning-row"
import { ToolRow } from "./tool-row"

export type ChatMessageRowProps = {
  message: ChatMessage
  streaming: boolean
}

// memo stays even with the React Compiler on: the compiler memoizes the
// list's .map() as a whole, not per item. While a reply streams, useChat
// replaces only the last message object, so every other row skips its render.
export const ChatMessageRow = memo(function ChatMessageRow({
  message,
  streaming,
}: ChatMessageRowProps) {
  if (message.role === "user") {
    return (
      <Message align="end">
        <MessageContent>
          <Bubble variant="secondary" align="end">
            <BubbleContent className="rounded-2xl px-4 py-2.5 whitespace-pre-wrap">
              {textOf(message)}
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    )
  }

  const steps = message.parts.filter(isStepPart)
  const reply = textOf(message)

  return (
    <Message align="start">
      <MessageContent className="gap-3">
        {steps.length > 0 ? (
          <Trace>
            {steps.map((part, index) =>
              part.type === "reasoning" ? (
                <ReasoningRow
                  key={index}
                  text={part.text}
                  running={part.state === "streaming"}
                />
              ) : (
                <ToolRow
                  key={part.toolCallId}
                  part={part}
                  streaming={streaming}
                />
              )
            )}
          </Trace>
        ) : null}
        {reply ? (
          <Bubble variant="ghost">
            <BubbleContent>
              <Streamdown isAnimating={streaming}>{reply}</Streamdown>
            </BubbleContent>
          </Bubble>
        ) : null}
      </MessageContent>
    </Message>
  )
})
```

**New file** `_components/chat-message-list.tsx` (empty state, thinking line, error and
`readableError` all move here from the panel):

```tsx
"use client"

import { LoaderCircleIcon, MessageCircleDashedIcon } from "lucide-react"
import { chatErrorResponse } from "@/modules/chats/contracts"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Message, MessageContent, MessageGroup } from "@/components/ui/message"
import { TraceIcon, TraceLine, TraceTitle } from "@/components/ui/trace"
import { ChatMessageRow } from "./chat-message-row"
import { useChatActions, useChatState } from "./chat-provider"

export function ChatMessageList() {
  const { messages, status, error, busy } = useChatState()
  const { retry } = useChatActions()
  const last = messages.at(-1)

  return (
    <div className="flex-1 overflow-y-auto">
      <MessageGroup className="mx-auto w-full max-w-3xl gap-6 px-4 py-8">
        {messages.length === 0 ? <ChatEmpty /> : null}

        {messages.map((message) => (
          <ChatMessageRow
            key={message.id}
            message={message}
            streaming={busy && message === last}
          />
        ))}

        {/* Between send and the first chunk there is no assistant message yet. */}
        {status === "submitted" ? (
          <Message align="start">
            <MessageContent>
              <TraceLine status="running">
                <TraceIcon>
                  <LoaderCircleIcon className="animate-spin" />
                </TraceIcon>
                <TraceTitle>Thinking</TraceTitle>
              </TraceLine>
            </MessageContent>
          </Message>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="flex flex-col items-start gap-2 text-sm text-destructive"
          >
            <p>{readableError(error)}</p>
            <Button type="button" variant="outline" size="sm" onClick={retry}>
              Try again
            </Button>
          </div>
        ) : null}
      </MessageGroup>
    </div>
  )
}

function ChatEmpty() {
  return (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <MessageCircleDashedIcon />
        </EmptyMedia>
        <EmptyTitle>What should we build?</EmptyTitle>
        <EmptyDescription>
          Ask about the weather, or anything else. Press send to start.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

const FALLBACK = "Something went wrong. Try again in a moment."

// Two shapes arrive here:
// - HTTP error before the stream: `message` is the raw body, our `{ error }` JSON;
// - error chunk during the stream: `message` is already describeAiError's copy.
function readableError(error: Error): string {
  try {
    const body = chatErrorResponse.safeParse(JSON.parse(error.message))
    if (body.success) return body.data.error
  } catch {
    // Not JSON: an in-stream message, or a body we didn't write.
  }
  return error.message.startsWith("<") ? FALLBACK : error.message || FALLBACK
}
```

**Delete** `_components/chat-panel.tsx`.

**`page.tsx`, final.** The page now composes the chat itself, and the commented-out old renderer is gone:

```tsx
import { notFound } from "next/navigation"
import { ChatDeleteDialog } from "./_components/chat-delete-dialog"
import { ChatForm } from "./_components/chat-form"
import { ChatMessageList } from "./_components/chat-message-list"
import { ChatProvider } from "./_components/chat-provider"
import * as chats from "@/modules/chats"

export default async function ChatPage(props: PageProps<"/[chatId]">) {
  const { chatId } = await props.params
  const chat = await chats.getChat(chatId)
  if (!chat) notFound()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-4 py-3">
        <h1 className="truncate text-sm font-medium">{chat.title}</h1>
        {chat.canDelete && <ChatDeleteDialog chatId={chatId} />}
      </header>

      <ChatProvider chatId={chatId} initialMessages={chat.messages}>
        <ChatMessageList />
        <ChatForm />
      </ChatProvider>
    </div>
  )
}
```

**Check:** Profiler with highlights on, send a message. While it streams, only the last row,
the list and the form highlight; older rows don't.

Commit: `refactor(chat): split ChatPanel into ChatMessageList and ChatMessageRow`

---

## Step 7: final check

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Manual smoke test (`pnpm dev`). Each item uses a code path that moved:

- [ ] Empty chat shows "What should we build?"
- [ ] Send with the button and with Enter; Shift+Enter adds a newline
- [ ] "Thinking" appears between send and the first chunk
- [ ] A reasoning step opens while it runs, closes after, and stays open once you toggle it
- [ ] "Weather in Berlin?" → "Checking…" then "Checked the weather in Berlin", expandable output
- [ ] "Where am I?" → confirmation with Yes/No; **Yes** → location tool runs automatically, reply follows
- [ ] Same with **No** → the model gets "No, denied"
- [ ] Stop during a tool call → row shows "Stopped: …"
- [ ] Error path (e.g. stop the dev DB or break the API key) → message + "Try again" resends once (no duplicate after reload)
- [ ] Reload the page: history renders the same as live
- [ ] Delete dialog still works

---

## What this makes easy next (not part of the migration)

- **Throttle streaming renders:** `useChat({ throttle: 50, ... })` in the provider (in this SDK
  version it is `throttle`; `experimental_throttle` is deprecated). The change lives in one file,
  and only if the profiler says it's needed.
- **`MessageScroller`** (`components/ui/message-scroller.tsx`): its items already set
  `content-visibility: auto` (`rendering-content-visibility`). Rough shape, which I haven't tried:
  `MessageScrollerProvider` wraps the list *and* the form in `page.tsx`, so `ChatForm` can call
  `useMessageScroller().scrollToEnd()` on send. `ChatMessageList` renders `MessageScroller` →
  `Viewport` → `Content` → one `MessageScrollerItem messageId={m.id}` around each `ChatMessageRow`.
  Without the provider this would mean passing props everywhere again; with it, it's a local change.
- **A new tool:** add it to `toolSchemas`. Typecheck then points at `ToolRow`, where you add one case
  and one `<Name>ToolRow` that returns `ToolStatusRow` with an icon and text.
