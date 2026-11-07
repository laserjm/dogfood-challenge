import { DatabaseMessages } from "@/app/(chat)/[chatId]/_components/chat-page"
import { upsertMessageAction } from "@/app/(chat)/_lib/actions"
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  UIMessage,
} from "ai"

// Allow streaming responses up to 30 seconds
export const maxDuration = 30
if (!process.env.AI_GATEWAY_MODEL) throw Error("no ai gateway model")
const AI_GATEWAY_MODEL = process.env.AI_GATEWAY_MODEL

// export async function POST(req: Request) {
//   const { messages }: { messages: UIMessage[] } = await req.json()

//   const result = streamText({
//     model: "anthropic/claude-haiku-5.5",
//     instructions: "You are a helpful assistant.",
//     messages: await convertToModelMessages(messages),
//   })

//   return createUIMessageStreamResponse({
//     stream: toUIMessageStream({ stream: result.stream }),
//   })
// }
export async function POST(req: Request) {
  const { id, messages }: { id: string; messages: UIMessage[] } =
    await req.json()

  //   console.dir({ incomingUIMessages: messages }, { depth: null })
  const lastMessage = messages.findLast(() => true)
  //   console.dir({ lastMessage: lastMessage }, { depth: null })
  await upsertMessageAction(
    id,
    {
      id: lastMessage?.id as string,
      role: lastMessage?.role,
      parts: lastMessage?.parts,
    },
    messages.length - 1
  )

  const modelMessages = await convertToModelMessages(messages)

  //   console.dir({ modelMessages }, { depth: null })

  const result = streamText({
    model: AI_GATEWAY_MODEL,
    instructions: "You are a helpful assistant.",
    messages: modelMessages,
    onError: ({ error }) => {
      console.error("[server] generation error", error)
    },
  })

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      generateMessageId: () => crypto.randomUUID(),
      onEnd: ({ responseMessage, messages, outcome }) => {
        // console.log("store response message")
        // console.dir({ responseMessage, messages, outcome }, { depth: null })
        upsertMessageAction(id, responseMessage, messages.length - 1)
      },
    }),
  })
}
