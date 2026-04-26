import {
  createAgentUIStream,
  createUIMessageStreamResponse,
} from "ai"
import { pipeJsonRender } from "@json-render/core"
import {
  createPropertyAnalyst,
  createContextAwareAnalyst,
  type ParcelContext,
} from "@/lib/agents/property-analyst"
import { createGroq } from "@ai-sdk/groq"

export const maxDuration = 60

const groq = createGroq({ apiKey: process.env.GROQ_API_KEY })

export async function POST(req: Request) {
  const { messages, parcelContext } = (await req.json()) as {
    messages: unknown
    parcelContext?: ParcelContext | null
  }

  console.log(`\n${"=".repeat(60)}`)
  console.log(`[CHAT] POST /api/chat — ${(messages as unknown[]).length} message(s)`)
  if (parcelContext) {
    console.log(`[CHAT] Context-aware mode: ${parcelContext.address} (${parcelContext.bbl})`)
  } else {
    console.log(`[CHAT] Independent mode (no parcel context)`)
  }
  console.log(`${"=".repeat(60)}`)

  const model = groq('llama-3.3-70b-versatile')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agent: any = parcelContext
    ? createContextAwareAnalyst(parcelContext, model)
    : createPropertyAnalyst(model)

  const stream = await createAgentUIStream({
    agent,
    uiMessages: messages as Parameters<typeof createAgentUIStream>[0]["uiMessages"],
  })

  const piped = pipeJsonRender(stream)

  return createUIMessageStreamResponse({ stream: piped })
}
