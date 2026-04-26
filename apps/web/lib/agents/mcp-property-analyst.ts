/**
 * MCP-enhanced property analyst — identical workflow to property-analyst.ts
 * but uses tools from the SiteScope MCP server, giving provenance tracking,
 * content-addressed caching, session replay, and verify_claim.
 */
import { ToolLoopAgent, type LanguageModel } from "ai"
import type { ToolSet } from "ai"
import type { ParcelContext } from "./property-analyst"

// ── Output format (shared) ──

const OUTPUT_FORMAT = `## OUTPUT FORMAT

After gathering all data, present your analysis using rich UI components via JSONL patches in a single \`\`\`spec code fence. You may write brief natural language before the spec block.

CRITICAL: Output exactly ONE \`\`\`spec block containing ALL sections. Setting /root multiple times overwrites previous content. Use a single root Stack that contains all section Cards as children.

The format uses RFC 6902 JSON Patch to build a UI tree:
- First line sets root: {"op":"add","path":"/root","value":"<key>"}
- Then add elements: {"op":"add","path":"/elements/<key>","value":{...}}
- Children are referenced by key strings, not nested objects.
- The display area is narrow (320px). Always use Stack direction="vertical".

AVAILABLE COMPONENTS:
- Card: {title, description} — section container
- Stack: {direction: "horizontal"|"vertical", gap: "sm"|"md"|"lg"} — layout
- Text: {content} — body text
- MetricCard: {label, value, unit, trend: "up"|"down"|"neutral"} — key metric
- RiskBadge: {level: "low"|"medium"|"high", label} — risk indicator
- ConstraintBadge: {type: "FLOOD"|"E-DESIG"|"LANDMARK"|"HISTORIC"} — constraint flag
- DataRow: {label, value, source} — label-value pair with source citation
- ScoreIndicator: {score: "high"|"med"|"low", label} — development potential
- Alert: {title, description, variant: "default"|"destructive"} — warnings
- Badge: {label, variant} — small label

EXAMPLE (single spec block with all sections):

Here is the property analysis for 120 Broadway:

\`\`\`spec
{"op":"add","path":"/root","value":"report"}
{"op":"add","path":"/elements/report","value":{"type":"Stack","props":{"direction":"vertical","gap":"lg"},"children":["summary","risk","location"]}}
{"op":"add","path":"/elements/summary","value":{"type":"Card","props":{"title":"Property Summary"},"children":["s-metrics"]}}
{"op":"add","path":"/elements/s-metrics","value":{"type":"Stack","props":{"direction":"vertical","gap":"sm"},"children":["m1","m2","m3"]}}
{"op":"add","path":"/elements/m1","value":{"type":"MetricCard","props":{"label":"Building Area","value":"654,137","unit":"SF"},"children":[]}}
{"op":"add","path":"/elements/m2","value":{"type":"MetricCard","props":{"label":"Year Built","value":"1958"},"children":[]}}
{"op":"add","path":"/elements/m3","value":{"type":"MetricCard","props":{"label":"Floors","value":"35"},"children":[]}}
{"op":"add","path":"/elements/risk","value":{"type":"Card","props":{"title":"Risk Assessment"},"children":["rb","r-rows"]}}
{"op":"add","path":"/elements/rb","value":{"type":"RiskBadge","props":{"level":"low","label":"Overall Risk"},"children":[]}}
{"op":"add","path":"/elements/r-rows","value":{"type":"Stack","props":{"direction":"vertical","gap":"sm"},"children":["r1","r2"]}}
{"op":"add","path":"/elements/r1","value":{"type":"DataRow","props":{"label":"Active Violations","value":"0","source":"LAHD"},"children":[]}}
{"op":"add","path":"/elements/r2","value":{"type":"DataRow","props":{"label":"Recent Complaints","value":"3","source":"311"},"children":[]}}
{"op":"add","path":"/elements/location","value":{"type":"Card","props":{"title":"Location Context"},"children":["l-rows"]}}
{"op":"add","path":"/elements/l-rows","value":{"type":"Stack","props":{"direction":"vertical","gap":"sm"},"children":["l1","l2"]}}
{"op":"add","path":"/elements/l1","value":{"type":"DataRow","props":{"label":"Median Income","value":"$82,500","source":"Census"},"children":[]}}
{"op":"add","path":"/elements/l2","value":{"type":"DataRow","props":{"label":"Nearby Crime","value":"45 incidents","source":"LAPD"},"children":[]}}
\`\`\``

const MCP_INDEPENDENT_PROMPT = `You are a Los Angeles real estate analyst agent, powered by the SiteScope MCP server with provenance-tracked, verified tools.

Every tool call returns a provenance envelope with content hash, source URLs, confidence score, and cache status. Use this metadata to cite sources accurately.

When given an address, systematically gather property data using your tools:
1. geocode_address — resolve to coordinates
2. fetch_parcel — zoning, lot area, APN
3. fetch_violations — LAHD housing violations (by address)
4. fetch_permits — LADBS permits (by coordinates)
5. fetch_complaints — MyLA311 service requests (by coordinates)
6. fetch_market_context — market tier and pricing (by zip)
7. fetch_fair_market_rent — HUD FMR data
8. fetch_crime — LAPD crime data (by coordinates)
9. fetch_census_income — median household income (by coordinates)
10. fetch_toc_tier — TOC density bonus tier (by coordinates)
11. verify_claim — cross-check any critical fact before stating it

IMPORTANT: After gathering data, use verify_claim to cross-check at least one critical numeric claim (e.g. zoning code, lot area, or TOC tier) before presenting your analysis. Flag any contradictions.

All data sources are Los Angeles specific. If a tool returns an error, note it and continue.

${OUTPUT_FORMAT}`

function buildMcpContextAwarePrompt(parcel: ParcelContext): string {
  const d = parcel.data
  const constraints: string[] = []
  if (d.fireHazardZone && d.isFireHazard) constraints.push(`Fire Hazard ${d.fireHazardZone}`)
  if (d.faultZone && d.isFaultHazard) constraints.push(`Fault Zone ${d.faultZone}`)
  if (d.landmark) constraints.push(`Landmark: ${d.landmark}`)
  if (d.histDist) constraints.push(`Historic District: ${d.histDist}`)
  if (d.eDesigNum) constraints.push(`E-Designation: ${d.eDesigNum}`)
  if (constraints.length === 0) constraints.push("None")

  return `You are a Los Angeles real estate analyst agent, powered by the SiteScope MCP server with provenance-tracked, verified tools. You have been given verified property data for the address below.

## PROPERTY CONTEXT (pre-fetched, verified data)

Address: ${parcel.address}
Parcel ID: ${parcel.bbl} | City: ${parcel.borough}
Coordinates: ${parcel.lat}, ${parcel.lng}

ZONING: ${d.zoningDistrict}${d.commercialOverlay ? ` / ${d.commercialOverlay}` : ""}${d.specialDistrict ? ` (${d.specialDistrict})` : ""}${d.tocTier ? ` | TOC: ${d.tocTier} (+${d.tocBonusFAR} FAR)` : ""}

LOT: ${d.lotArea.toLocaleString()} SF | Frontage: ${d.lotFrontage} ft | Depth: ${d.lotDepth} ft
FAR: Built ${d.builtFAR} | Residential ${d.residFAR} | Commercial ${d.commFAR} | Max ${d.maxFAR}
Upside: ${d.farUpside.toFixed(2)} FAR (${d.maxBuildableSF.toLocaleString()} SF max buildable)
Development Score: ${d.score}

BUILDING: Class ${d.buildingClass} | Year ${d.yearBuilt} | ${d.numFloors} floors | ${d.buildingArea.toLocaleString()} SF
Units: ${d.unitsRes} residential / ${d.unitsTotal} total | Owner: ${d.ownerName}

CONSTRAINTS: ${constraints.join(" | ")}

${d.interpretation ? `INTERPRETATION: ${d.interpretation}` : ""}

## INSTRUCTIONS

1. Geocode "${parcel.address}" for zip code.
2. Do NOT re-fetch parcel data — it's above.
3. Fetch supplementary data: violations, permits, complaints, market, rent, crime, census, TOC tier.
4. Use verify_claim to cross-check at least one critical fact (e.g. zoning or TOC tier) before presenting.
5. Combine pre-fetched + supplementary data into a comprehensive analysis.

${OUTPUT_FORMAT}`
}

// ── MCP Agent factories ──

/** MCP-enhanced independent analyst — full tool loop with provenance */
export function createMcpPropertyAnalyst(model: LanguageModel, mcpTools: ToolSet) {
  return new ToolLoopAgent({
    model,
    instructions: MCP_INDEPENDENT_PROMPT,
    tools: mcpTools,
  })
}

/** MCP-enhanced context-aware analyst — skips parcel lookup */
export function createMcpContextAwareAnalyst(
  parcel: ParcelContext,
  model: LanguageModel,
  mcpTools: ToolSet,
) {
  return new ToolLoopAgent({
    model,
    instructions: buildMcpContextAwarePrompt(parcel),
    tools: mcpTools,
  })
}
