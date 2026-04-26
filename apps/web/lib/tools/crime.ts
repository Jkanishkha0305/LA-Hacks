import { tool } from "ai"
import { z } from "zod"
import { socrataQuery, isSocrataError } from "@/lib/api/socrata"
import { LA_SOCRATA_DATASETS } from "@/lib/config/data-sources"
import type { LapdCrimeRow } from "@/lib/types/api-responses"

export const crimeTool = tool({
  description:
    "Fetch LAPD crime data near a location. Returns crime counts by category and offense type within a given radius.",
  inputSchema: z.object({
    lat: z.number().describe("Latitude"),
    lng: z.number().describe("Longitude"),
    radiusMeters: z
      .number()
      .default(304)
      .describe("Search radius in meters (default 304m / ~1000ft)"),
  }),
  execute: async ({ lat, lng, radiusMeters }) => {
    console.log(`\n[TOOL:fetchCrimeData] ▶ Input: lat=${lat} lng=${lng} radius=${radiusMeters}m`)
    // Get last 12 months of data
    const oneYearAgo = new Date()
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
    const dateStr = oneYearAgo.toISOString().split("T")[0]

    // LAPD dataset uses text lat/lon columns, not a geo point — use bounding box
    const degDelta = radiusMeters / 111_000
    const rows = await socrataQuery<LapdCrimeRow>(
      LA_SOCRATA_DATASETS.crime,
      {
        $where: `lat between '${(lat - degDelta).toFixed(5)}' and '${(lat + degDelta).toFixed(5)}' AND lon between '${(lng - degDelta).toFixed(5)}' and '${(lng + degDelta).toFixed(5)}' AND date_occ >= '${dateStr}'`,
        $limit: "200",
      },
      "lapd_crime",
    )
    if (isSocrataError(rows)) {
      console.error(`[TOOL:fetchCrimeData] ✗ Error:`, rows.error)
      return rows
    }

    const byCategory = rows.reduce(
      (acc, r) => {
        const desc = r.crm_cd_desc || "Unknown"
        acc[desc] = (acc[desc] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )

    const bySeverity = { part1: 0, part2: 0 }
    for (const r of rows) {
      if (r.part_1_2 === '1') bySeverity.part1++
      else if (r.part_1_2 === '2') bySeverity.part2++
    }

    const result = {
      totalIncidents: rows.length,
      byCategory,
      bySeverity,
      radiusMeters,
      areaName: rows[0]?.area_name ?? null,
    }
    console.log(`[TOOL:fetchCrimeData] ✓ ${result.totalIncidents} incidents | Part I=${bySeverity.part1} Part II=${bySeverity.part2} area=${result.areaName}`)
    return result
  },
})
