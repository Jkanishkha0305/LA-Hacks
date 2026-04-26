import { generateText, stepCountIs } from "ai"
import { getGoogleProvider } from "@/lib/google-provider"
import { GeminiModel } from "@/lib/config/models"
import { connectMcp } from "@/lib/mcp/client"

export const maxDuration = 120

const SYSTEM_PROMPT = `You are SiteScope (MCP-Enhanced), a Los Angeles real estate due-diligence agent powered by verified, provenance-tracked data tools.

CRITICAL: Every data point you return is backed by a MCP provenance envelope with:
- Content hash (SHA-256) proving data integrity
- Source URLs linking to original datasets
- Confidence scores indicating data reliability
- Cache hit/miss status for transparency

When given an address or property question, systematically gather data using your tools:
1. geocode_address — resolve the address to coordinates and parcel identifiers
2. fetch_parcel — get zoning, lot area, APN from LA City data
3. fetch_violations — check LAHD housing violations (by address)
4. fetch_permits — check LADBS building permits (by coordinates)
5. fetch_complaints — check MyLA311 service requests (by coordinates)
6. fetch_market_context — get market tier and pricing (by zip code)
7. fetch_fair_market_rent — get HUD FMR data
8. fetch_crime — LAPD crime data (by coordinates)
9. fetch_census_income — census tract median income (by coordinates)
10. fetch_toc_tier — Transit-Oriented Communities density bonus tier (by coordinates)

After gathering data, you may also call:
11. verify_claim — cross-check any numeric fact you're about to state (zoning, lot area, APN, TOC tier, permit count)

IMPORTANT: If verify_claim contradicts your data, flag it. Never silently override verified data.

## OUTPUT FORMAT

Use clean markdown:
- A short headline (## h2)
- 2-4 sections (### h3): Property Summary, Risk Assessment, Location Context, Recommendation
- Bullet points with source citations in parentheses, e.g. "Zoning: R3-1 (LA City Parcels, confidence: 1.0)"
- Include confidence scores where available
- One-sentence **Verdict:** at the end
- Be dense and decisive. Acquisitions associates want signal, not prose.

If the user's question is not an address or property query, answer briefly without calling tools.`

interface AgentRequestBody {
  message?: string
  address?: string
}

export async function POST(req: Request) {
  let body: AgentRequestBody
  try {
    body = (await req.json()) as AgentRequestBody
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const userMessage =
    body.message?.trim() ||
    (body.address ? `Analyze this LA property: ${body.address}` : "")

  if (!userMessage) {
    return Response.json(
      { error: "Provide either 'message' or 'address' in the request body" },
      { status: 400 },
    )
  }

  console.log(`\n${"=".repeat(60)}`)
  console.log(`[AGENT-MCP] POST /api/agent/mcp — "${userMessage.slice(0, 80)}${userMessage.length > 80 ? "..." : ""}"`)
  console.log(`${"=".repeat(60)}`)

  const google = getGoogleProvider(req)
  const model = google(GeminiModel.FLASH_LITE)

  let mcp: Awaited<ReturnType<typeof connectMcp>> | null = null
  try {
    mcp = await connectMcp()
    console.log(`[AGENT-MCP] Connected — ${Object.keys(mcp.tools).length} tools available`)

    const result = await generateText({
      model,
      system: SYSTEM_PROMPT,
      prompt: userMessage,
      tools: mcp.tools,
      stopWhen: stepCountIs(20),
    })

    const text = result.text?.trim() || "(no response)"
    const toolCalls = result.steps.reduce(
      (acc, step) => acc + (step.toolCalls?.length ?? 0),
      0,
    )

    console.log(`[AGENT-MCP] Done — steps: ${result.steps.length} | tools: ${toolCalls} | provenance entries: ${mcp.provenanceLog.length}`)

    return Response.json({
      response: text,
      steps: result.steps.length,
      toolCalls,
      mode: "mcp",
      provenance: mcp.provenanceLog,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[AGENT-MCP] Error:`, message)
    return Response.json(
      { error: `MCP Agent error: ${message}` },
      { status: 500 },
    )
  } finally {
    if (mcp) await mcp.close()
  }
}
