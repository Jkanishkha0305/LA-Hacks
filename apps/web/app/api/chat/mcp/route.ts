import {
  createAgentUIStream,
  createUIMessageStreamResponse,
} from "ai"
import { pipeJsonRender } from "@json-render/core"
import {
  createMcpPropertyAnalyst,
  createMcpContextAwareAnalyst,
} from "@/lib/agents/mcp-property-analyst"
import type { ParcelContext } from "@/lib/agents/property-analyst"
import { getGoogleProvider } from "@/lib/google-provider"
import { GeminiModel } from "@/lib/config/models"
import { connectMcp, type McpConnection } from "@/lib/mcp/client"

export const maxDuration = 120

export async function POST(req: Request) {
  const { messages, parcelContext } = (await req.json()) as {
    messages: unknown
    parcelContext?: ParcelContext | null
  }

  console.log(`\n${"=".repeat(60)}`)
  console.log(`[CHAT-MCP] POST /api/chat/mcp — ${(messages as unknown[]).length} message(s)`)
  if (parcelContext) {
    console.log(`[CHAT-MCP] Context-aware: ${parcelContext.address} (${parcelContext.bbl})`)
  } else {
    console.log(`[CHAT-MCP] Independent mode`)
  }
  console.log(`${"=".repeat(60)}`)

  const google = getGoogleProvider(req)
  const model = google(GeminiModel.FLASH_LITE)

  let mcp: McpConnection | null = null
  try {
    mcp = await connectMcp()
    console.log(`[CHAT-MCP] Connected — ${Object.keys(mcp.tools).length} MCP tools`)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agent: any = parcelContext
      ? createMcpContextAwareAnalyst(parcelContext, model, mcp.tools)
      : createMcpPropertyAnalyst(model, mcp.tools)

    const mcpRef = mcp // capture for cleanup
    const stream = await createAgentUIStream({
      agent,
      uiMessages: messages as Parameters<typeof createAgentUIStream>[0]["uiMessages"],
      onFinish: () => {
        console.log(`[CHAT-MCP] Stream finished — provenance entries: ${mcpRef.provenanceLog.length}`)
        mcpRef.close().catch(() => {})
      },
    })

    const piped = pipeJsonRender(stream)
    return createUIMessageStreamResponse({ stream: piped })
  } catch (err) {
    if (mcp) await mcp.close()
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[CHAT-MCP] Error:`, message)
    return Response.json({ error: `MCP Chat error: ${message}` }, { status: 500 })
  }
}
