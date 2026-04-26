/**
 * fetch_permits — LADBS building permits within radius of a coord.
 */
import { z } from "zod"
import { LA_ARCGIS_LAYERS, withTimeout } from "../config.js"
import type { ToolDefinition } from "../runtime.js"

const inputSchema = z.object({
  lat: z.number().describe("Latitude"),
  lng: z.number().describe("Longitude"),
  radiusMeters: z.number().int().positive().max(2000).default(100).describe("Search radius (≤2000m)."),
})

export interface PermitsOutput {
  totalPermits: number
  radiusMeters: number
  permits: Array<{
    permitNumber: string
    permitType: string
    permitSubType: string
    status: string
    issueDate: string
    address: string
    workDescription: string
  }>
}

export const permitsTool: ToolDefinition<z.infer<typeof inputSchema>, PermitsOutput> = {
  name: "fetch_permits",
  version: "1.0.0",
  title: "Fetch LADBS permits",
  description:
    "Fetch LADBS (LA Dept of Building & Safety) building permits within a radius of a coordinate. Returns permit type, status, issue date, work description.",
  inputSchema,
  cacheTtlMs: 1000 * 60 * 60 * 6, // 6h — permits change daily
  execute: async ({ lat, lng, radiusMeters }, ctx) => {
    const url = new URL(LA_ARCGIS_LAYERS.ladbsPermits)
    url.searchParams.set("geometry", `${lng},${lat}`)
    url.searchParams.set("geometryType", "esriGeometryPoint")
    url.searchParams.set("spatialRel", "esriSpatialRelIntersects")
    url.searchParams.set("inSR", "4326")
    url.searchParams.set("distance", String(radiusMeters))
    url.searchParams.set("units", "esriSRUnit_Meter")
    url.searchParams.set("outFields", "*")
    url.searchParams.set("returnGeometry", "false")
    url.searchParams.set("f", "json")

    const res = await ctx.trackedFetch(url.toString(), {
      signal: withTimeout(12_000),
      sourceId: "lacity_ladbs:permits",
      sourceLabel: "LADBS Building Permits",
    })
    if (!res.ok) throw new Error(`LADBS permits HTTP ${res.status}`)
    const data = (await res.json()) as { features?: Array<{ attributes?: Record<string, unknown> }> }
    const features = data.features ?? []
    return {
      totalPermits: features.length,
      radiusMeters,
      permits: features.slice(0, 25).map((f) => {
        const a = f.attributes ?? {}
        return {
          permitNumber: String(a.PERMIT_NBR ?? a.permit_nbr ?? ""),
          permitType: String(a.PERMIT_TYPE ?? a.permit_type ?? ""),
          permitSubType: String(a.PERMIT_SUB_TYPE ?? a.permit_sub_type ?? ""),
          status: String(a.STATUS ?? a.status ?? ""),
          issueDate: String(a.ISSUE_DATE ?? a.issue_date ?? ""),
          address: String(a.ADDRESS ?? a.address ?? ""),
          workDescription: String(a.WORK_DESC ?? a.work_desc ?? ""),
        }
      }),
    }
  },
}
