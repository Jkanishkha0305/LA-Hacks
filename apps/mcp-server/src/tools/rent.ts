/**
 * fetch_fair_market_rent — HUD Fair Market Rent for LA metro.
 *
 * HUD requires an API key. Without one, returns the published 2024 LA-LB-Anaheim
 * MSA values as a deterministic fallback (sources are cited so the agent knows).
 */
import { z } from "zod"
import { HUD_FMR_BASE_URL, env, withTimeout } from "../config.js"
import type { ToolDefinition } from "../runtime.js"

const inputSchema = z.object({
  area: z.string().default("Los Angeles").describe("Defaults to LA County."),
})

export interface RentOutput {
  areaName: string
  year: number
  efficiency: number
  oneBr: number
  twoBr: number
  threeBr: number
  fourBr: number
  source: "hud_api" | "hud_published_fallback"
}

// Published HUD FY2024 FMR for Los Angeles-Long Beach-Anaheim, CA HUD Metro FMR Area.
const HUD_LA_2024_FALLBACK: Omit<RentOutput, "source"> = {
  areaName: "Los Angeles-Long Beach-Anaheim, CA HUD Metro FMR Area",
  year: 2024,
  efficiency: 1747,
  oneBr: 1979,
  twoBr: 2480,
  threeBr: 3304,
  fourBr: 3580,
}

export const rentTool: ToolDefinition<z.infer<typeof inputSchema>, RentOutput> = {
  name: "fetch_fair_market_rent",
  version: "1.0.0",
  title: "Fetch HUD Fair Market Rent",
  description:
    "Fetch HUD Fair Market Rent (FMR) for the Los Angeles metro area. Returns rent by bedroom count. Used to underwrite multifamily acquisitions vs. Section 8 ceilings.",
  inputSchema,
  cacheTtlMs: 1000 * 60 * 60 * 24 * 30,
  baseConfidence: 0.9,
  execute: async (_input, ctx) => {
    if (!env.HUD_API_TOKEN) {
      // Synthetic source — but cite the published HUD doc.
      ctx.pushSource({
        id: "hud_published_2024",
        url: "https://www.huduser.gov/portal/datasets/fmr/fmrs/FY2024_code/2024summary.odn?inputname=METRO31100M31100*Los+Angeles-Long+Beach-Anaheim%2C+CA+HUD+Metro+FMR+Area",
        fetched_at: new Date().toISOString(),
        label: "HUD FY2024 FMR — published table",
      })
      return { ...HUD_LA_2024_FALLBACK, source: "hud_published_fallback" as const }
    }

    // Authenticated HUD API call. Entity ID for LA-LB-Anaheim MSA is METRO31100M31100.
    const url = `${HUD_FMR_BASE_URL}/METRO31100M31100`
    const res = await ctx.trackedFetch(url, {
      signal: withTimeout(8000),
      headers: { Authorization: `Bearer ${env.HUD_API_TOKEN}` },
      sourceId: "hud_api",
      sourceLabel: "HUD User FMR API",
    })
    if (!res.ok) throw new Error(`HUD FMR HTTP ${res.status}`)
    const data = (await res.json()) as {
      data?: { basicdata?: Array<{ Efficiency?: number; "One-Bedroom"?: number; "Two-Bedroom"?: number; "Three-Bedroom"?: number; "Four-Bedroom"?: number; year?: number; AreaName?: string }> }
    }
    const row = data.data?.basicdata?.[0]
    if (!row) throw new Error("HUD FMR returned no data")
    return {
      areaName: row.AreaName ?? "Los Angeles-Long Beach-Anaheim, CA HUD Metro FMR Area",
      year: row.year ?? new Date().getFullYear(),
      efficiency: row.Efficiency ?? 0,
      oneBr: row["One-Bedroom"] ?? 0,
      twoBr: row["Two-Bedroom"] ?? 0,
      threeBr: row["Three-Bedroom"] ?? 0,
      fourBr: row["Four-Bedroom"] ?? 0,
      source: "hud_api" as const,
    }
  },
}
