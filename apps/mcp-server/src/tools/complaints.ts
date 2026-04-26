/**
 * fetch_complaints — MyLA311 service requests near a coordinate.
 */
import { z } from "zod"
import { LA_SOCRATA_BASE, LA_SOCRATA_DATASETS, env, withTimeout } from "../config.js"
import type { ToolDefinition } from "../runtime.js"

const inputSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  radiusMeters: z.number().int().positive().max(2000).default(100),
})

export interface ComplaintsOutput {
  totalComplaints: number
  byType: Record<string, number>
  recent: Array<{
    srNumber: string
    type: string
    status: string
    createdDate: string
    closedDate: string
    address: string
    neighborhoodCouncil: string
  }>
}

export const complaintsTool: ToolDefinition<z.infer<typeof inputSchema>, ComplaintsOutput> = {
  name: "fetch_complaints",
  version: "1.0.0",
  title: "Fetch MyLA311 complaints",
  description:
    "Fetch MyLA311 service requests near a coordinate. Surfaces neighborhood quality-of-life signals: graffiti, illegal dumping, homelessness encampments, etc.",
  inputSchema,
  cacheTtlMs: 1000 * 60 * 60 * 12,
  execute: async ({ lat, lng, radiusMeters }, ctx) => {
    const url = new URL(`${LA_SOCRATA_BASE}/${LA_SOCRATA_DATASETS.complaints311}.json`)
    url.searchParams.set("$where", `within_circle(location, ${lat}, ${lng}, ${radiusMeters})`)
    url.searchParams.set("$order", "createddate DESC")
    url.searchParams.set("$limit", "200")
    if (env.SOCRATA_APP_TOKEN) url.searchParams.set("$$app_token", env.SOCRATA_APP_TOKEN)

    const res = await ctx.trackedFetch(url.toString(), {
      signal: withTimeout(10_000),
      sourceId: "lacity_socrata:rq3b-xjk8",
      sourceLabel: "MyLA311 Service Requests",
    })
    if (!res.ok) throw new Error(`MyLA311 HTTP ${res.status}`)
    const rows = (await res.json()) as Array<Record<string, string>>

    const byType: Record<string, number> = {}
    for (const c of rows) {
      const t = c.requesttype || "Unknown"
      byType[t] = (byType[t] ?? 0) + 1
    }

    return {
      totalComplaints: rows.length,
      byType,
      recent: rows.slice(0, 20).map((c) => ({
        srNumber: c.srnumber ?? "",
        type: c.requesttype ?? "",
        status: c.status ?? "",
        createdDate: c.createddate ?? "",
        closedDate: c.closeddate ?? "",
        address: c.address ?? "",
        neighborhoodCouncil: c.ncname ?? "",
      })),
    }
  },
}
