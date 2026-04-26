/**
 * fetch_toc_tier — LA Transit-Oriented Communities tier (1-4) at a coordinate.
 *
 * TOC tier dictates affordable-housing density bonuses under Measure JJJ.
 * This is a power-user feature — most analyst tools don't surface it.
 */
import { z } from "zod"
import { LA_ARCGIS_LAYERS, withTimeout } from "../config.js"
import type { ToolDefinition } from "../runtime.js"

const inputSchema = z.object({
  lat: z.number(),
  lng: z.number(),
})

export interface TocTierOutput {
  tier: 0 | 1 | 2 | 3 | 4
  inTocArea: boolean
  notes: string
}

export const tocTierTool: ToolDefinition<z.infer<typeof inputSchema>, TocTierOutput> = {
  name: "fetch_toc_tier",
  version: "1.0.0",
  title: "Fetch TOC tier",
  description:
    "Return the LA Transit-Oriented Communities (TOC) tier at a coordinate. Tier 0 = not in TOC area; 1-4 = increasing density bonus eligibility under Measure JJJ.",
  inputSchema,
  cacheTtlMs: 1000 * 60 * 60 * 24 * 30, // TOC tiers don't change often
  execute: async ({ lat, lng }, ctx) => {
    const url = new URL(LA_ARCGIS_LAYERS.tocTiers)
    url.searchParams.set("geometry", `${lng},${lat}`)
    url.searchParams.set("geometryType", "esriGeometryPoint")
    url.searchParams.set("spatialRel", "esriSpatialRelIntersects")
    url.searchParams.set("inSR", "4326")
    url.searchParams.set("outFields", "*")
    url.searchParams.set("returnGeometry", "false")
    url.searchParams.set("f", "json")

    const res = await ctx.trackedFetch(url.toString(), {
      signal: withTimeout(8000),
      sourceId: "la_arcgis:toc_tiers",
      sourceLabel: "LA TOC Tiers (Oct 2017, Measure JJJ)",
    })
    if (!res.ok) throw new Error(`TOC tier HTTP ${res.status}`)
    const data = (await res.json()) as { features?: Array<{ attributes?: Record<string, unknown> }> }
    const feat = data.features?.[0]
    if (!feat) {
      return {
        tier: 0 as const,
        inTocArea: false,
        notes: "Coordinate is outside any LA TOC area — no Measure JJJ density bonus.",
      }
    }
    const tier = Number(feat.attributes?.TIER ?? feat.attributes?.tier ?? 0)
    const clamped = (tier >= 1 && tier <= 4 ? tier : 0) as 0 | 1 | 2 | 3 | 4
    return {
      tier: clamped,
      inTocArea: clamped > 0,
      notes:
        clamped === 0
          ? "Not in a TOC area."
          : `TOC Tier ${clamped} — eligible for Measure JJJ density bonuses.`,
    }
  },
}
