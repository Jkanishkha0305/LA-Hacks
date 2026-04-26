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
import { getGoogleProvider } from "@/lib/google-provider"
import { GeminiModel } from "@/lib/config/models"
import { getCachedAnalysis, saveAnalysis } from "@/lib/db/analysis-cache"

export const maxDuration = 60

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

  // Check MongoDB cache — first message on a known parcel = cache lookup
  if (parcelContext?.bbl && (messages as unknown[]).length <= 1) {
    const cached = await getCachedAnalysis(parcelContext.bbl)
    if (cached) {
      console.log(`[CHAT] Cache hit for BBL ${parcelContext.bbl} (${cached.hitCount} hits)`)
      return Response.json({ cached: true, messages: cached.messages })
    }
  }

  const google = getGoogleProvider(req)
  const model = google(GeminiModel.FLASH_LITE)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agent: any = parcelContext
    ? createContextAwareAnalyst(parcelContext, model)
    : createPropertyAnalyst(model)

  const stream = await createAgentUIStream({
    agent,
    uiMessages: messages as Parameters<typeof createAgentUIStream>[0]["uiMessages"],
    // Save to MongoDB once the agent finishes streaming. createUIMessageStreamResponse
    // returns SSE (text/event-stream), so we cannot read .json() off the response —
    // we have to capture messages from the stream lifecycle. onFinish runs after
    // the final assistant message lands, with the full message list.
    onFinish: ({ messages: finalMessages, isAborted }) => {
      if (isAborted) return
      if (!parcelContext?.bbl) return
      saveAnalysis(
        parcelContext.bbl,
        parcelContext.address,
        finalMessages,
      ).catch((err) => {
        console.error("[CHAT] cache save failed:", err)
      })
    },
  })

  const piped = pipeJsonRender(stream)
  return createUIMessageStreamResponse({ stream: piped })
}
