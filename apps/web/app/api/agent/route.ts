import { generateText, stepCountIs } from "ai"
import { geocodeTool } from "@/lib/tools/geocode"
import { parcelLookupTool } from "@/lib/tools/parcel-lookup"
import { violationsTool } from "@/lib/tools/violations"
import { permitsTool } from "@/lib/tools/permits"
import { complaintsTool } from "@/lib/tools/complaints"
import { salesTool } from "@/lib/tools/sales"
import { rentTool } from "@/lib/tools/rent"
import { crimeTool } from "@/lib/tools/crime"
import { censusTool } from "@/lib/tools/census"
import { getGoogleProvider } from "@/lib/google-provider"
import { GeminiModel } from "@/lib/config/models"

export const maxDuration = 120

const PLAIN_TEXT_PROMPT = `You are SiteScope, a Los Angeles real estate due-diligence agent for acquisitions associates and developers.

When given an address or property question, systematically gather data using your tools:
1. Geocode the address to get parcel identifiers, coordinates, city, zip code, and neighborhood
2. Fetch parcel data using coordinates (lat/lng)
3. Assess risk using LAHD violations (by address), LADBS permits (by coordinates), and MyLA311 complaints (by coordinates)
4. Pull LA market context (by zip code) and HUD fair market rent
5. Check location context — LAPD crime (by coordinates) and census income (by coordinates)

All data sources are Los Angeles specific. If a tool returns an error, note it and continue with available data. Always provide your assessment even with partial data.

## OUTPUT FORMAT — IMPORTANT

This response will be rendered as plain markdown in a chat interface (ASI:One), NOT in a custom UI.
Do NOT output JSONL patches, spec blocks, or any structured component format.
Use clean markdown only:

- A short headline (## h2)
- 2-4 short sections (### h3) covering: Property Summary, Risk, Location Context, Recommendation
- Bullet points for data, with source citations in parentheses (e.g. "Active violations: 0 (LAHD)")
- One-sentence verdict at the end labeled **Verdict:**
- Be dense and decisive. Acquisitions associates want signal, not prose.

If the user's question is not an address or property query, answer briefly in markdown without calling tools.`

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
  console.log(`[AGENT] POST /api/agent — message: "${userMessage.slice(0, 80)}${userMessage.length > 80 ? "..." : ""}"`)
  console.log(`${"=".repeat(60)}`)

  const google = getGoogleProvider(req)
  const model = google(GeminiModel.FLASH_LITE)

  try {
    const result = await generateText({
      model,
      system: PLAIN_TEXT_PROMPT,
      prompt: userMessage,
      tools: {
        geocodeAddress: geocodeTool,
        fetchParcelData: parcelLookupTool,
        fetchViolations: violationsTool,
        fetchPermits: permitsTool,
        fetchComplaints: complaintsTool,
        fetchMarketContext: salesTool,
        fetchRentData: rentTool,
        fetchCrimeData: crimeTool,
        fetchCensusData: censusTool,
      },
      stopWhen: stepCountIs(20),
    })

    const text = result.text?.trim() || "(no response)"
    console.log(`[AGENT] ✓ Steps: ${result.steps?.length ?? 0} | Response chars: ${text.length}`)

    return Response.json({
      response: text,
      steps: result.steps?.length ?? 0,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[AGENT] ✗ Error:`, message)
    return Response.json(
      { error: `Agent error: ${message}` },
      { status: 500 },
    )
  }
}
