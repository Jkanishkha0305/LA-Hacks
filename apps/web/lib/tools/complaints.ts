import { tool } from "ai"
import { z } from "zod"
import { socrataQuery, isSocrataError } from "@/lib/api/socrata"
import { LA_SOCRATA_DATASETS } from "@/lib/config/data-sources"
import type { MyLA311Row } from "@/lib/types/api-responses"

export const complaintsTool = tool({
  description:
    "Fetch MyLA311 service requests near an LA property by coordinates. Returns request types, statuses, and dates.",
  inputSchema: z.object({
    lat: z.number().describe("Latitude"),
    lng: z.number().describe("Longitude"),
    radiusMeters: z
      .number()
      .default(100)
      .describe("Search radius in meters (default 100m)"),
  }),
  execute: async ({ lat, lng, radiusMeters }) => {
    console.log(`\n[TOOL:fetchComplaints] ▶ Input: lat=${lat} lng=${lng} radius=${radiusMeters}m`)
    const rows = await socrataQuery<MyLA311Row>(
      LA_SOCRATA_DATASETS.complaints311,
      {
        $where: `within_circle(location, ${lat}, ${lng}, ${radiusMeters})`,
        $limit: "50",
        $order: "createddate DESC",
      },
      "myla311",
    )
    if (isSocrataError(rows)) {
      console.error(`[TOOL:fetchComplaints] ✗ Error:`, rows.error)
      return rows
    }

    const byType = rows.reduce(
      (acc, c) => {
        const type = c.requesttype || "Unknown"
        acc[type] = (acc[type] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )

    const result = {
      totalComplaints: rows.length,
      byType,
      recent: rows.slice(0, 10).map((c) => ({
        srNumber: c.srnumber,
        type: c.requesttype,
        status: c.status,
        createdDate: c.createddate,
        closedDate: c.closeddate,
        address: c.address,
        neighborhoodCouncil: c.ncname,
      })),
    }
    console.log(`[TOOL:fetchComplaints] ✓ ${result.totalComplaints} requests | types: ${JSON.stringify(result.byType)}`)
    return result
  },
})
