/**
 * fetch_crime — LAPD crime within radius. Categorized + Part I/II breakdown.
 */
import { z } from "zod"
import { LA_SOCRATA_BASE, LA_SOCRATA_DATASETS, env, withTimeout } from "../config.js"
import type { ToolDefinition } from "../runtime.js"

const inputSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  radiusMeters: z.number().int().positive().max(2000).default(304).describe("Default 304m (~1000ft)."),
  monthsBack: z.number().int().positive().max(36).default(12).describe("Months of history to include."),
})

export interface CrimeOutput {
  totalIncidents: number
  radiusMeters: number
  monthsBack: number
  byCategory: Record<string, number>
  bySeverity: { part1: number; part2: number }
  areaName: string | null
}

export const crimeTool: ToolDefinition<z.infer<typeof inputSchema>, CrimeOutput> = {
  name: "fetch_crime",
  version: "1.0.0",
  title: "Fetch LAPD crime data",
  description:
    "Fetch LAPD crime incidents near a coordinate. Returns count by category, Part I (serious) vs Part II (less serious) split, and the LAPD area name. Source: data.lacity.org/2nrs-mtv8.",
  inputSchema,
  cacheTtlMs: 1000 * 60 * 60 * 12,
  execute: async ({ lat, lng, radiusMeters, monthsBack }, ctx) => {
    const sinceDate = new Date()
    sinceDate.setMonth(sinceDate.getMonth() - monthsBack)
    const sinceStr = sinceDate.toISOString().split("T")[0]

    // LAPD dataset stores lat/lon as text → use bounding box.
    const degDelta = radiusMeters / 111_000
    const url = new URL(`${LA_SOCRATA_BASE}/${LA_SOCRATA_DATASETS.crime}.json`)
    url.searchParams.set(
      "$where",
      `lat between '${(lat - degDelta).toFixed(5)}' and '${(lat + degDelta).toFixed(5)}' AND lon between '${(lng - degDelta).toFixed(5)}' and '${(lng + degDelta).toFixed(5)}' AND date_occ >= '${sinceStr}'`,
    )
    url.searchParams.set("$limit", "500")
    if (env.SOCRATA_APP_TOKEN) url.searchParams.set("$$app_token", env.SOCRATA_APP_TOKEN)

    const res = await ctx.trackedFetch(url.toString(), {
      signal: withTimeout(10_000),
      sourceId: "lacity_socrata:2nrs-mtv8",
      sourceLabel: "LAPD Crime Data 2020-Present",
    })
    if (!res.ok) throw new Error(`LAPD crime HTTP ${res.status}`)
    const rows = (await res.json()) as Array<Record<string, string>>

    const byCategory: Record<string, number> = {}
    let part1 = 0
    let part2 = 0
    let areaName: string | null = null
    for (const r of rows) {
      const desc = r.crm_cd_desc || "Unknown"
      byCategory[desc] = (byCategory[desc] ?? 0) + 1
      if (r.part_1_2 === "1") part1++
      else if (r.part_1_2 === "2") part2++
      if (!areaName && r.area_name) areaName = r.area_name
    }

    return {
      totalIncidents: rows.length,
      radiusMeters,
      monthsBack,
      byCategory,
      bySeverity: { part1, part2 },
      areaName,
    }
  },
}
