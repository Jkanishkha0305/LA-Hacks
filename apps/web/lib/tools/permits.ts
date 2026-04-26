import { tool } from "ai"
import { z } from "zod"
import { LA_ARCGIS_LAYERS } from "@/lib/config/data-sources"

export const permitsTool = tool({
  description:
    "Fetch LADBS building permits near an LA property by coordinates. Returns permit types, statuses, and dates from the LADBS ArcGIS service.",
  inputSchema: z.object({
    lat: z.number().describe("Latitude"),
    lng: z.number().describe("Longitude"),
  }),
  execute: async ({ lat, lng }) => {
    console.log(`\n[TOOL:fetchPermits] ▶ Input: lat=${lat} lng=${lng}`)
    try {
      const url = new URL(LA_ARCGIS_LAYERS.ladbsPermits)
      url.searchParams.set('geometry', `${lng},${lat}`)
      url.searchParams.set('geometryType', 'esriGeometryPoint')
      url.searchParams.set('spatialRel', 'esriSpatialRelIntersects')
      url.searchParams.set('inSR', '4326')
      url.searchParams.set('distance', '100')
      url.searchParams.set('units', 'esriSRUnit_Meter')
      url.searchParams.set('outFields', '*')
      url.searchParams.set('returnGeometry', 'false')
      url.searchParams.set('f', 'json')

      const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
      if (!res.ok) throw new Error(`LADBS permits HTTP ${res.status}`)
      const data = await res.json() as { features?: Array<{ attributes?: Record<string, unknown> }> }
      const features = data.features ?? []

      const result = {
        totalPermits: features.length,
        permits: features.slice(0, 15).map((f) => {
          const a = f.attributes ?? {}
          return {
            permitNumber: String(a.PERMIT_NBR ?? a.permit_nbr ?? ''),
            permitType: String(a.PERMIT_TYPE ?? a.permit_type ?? ''),
            permitSubType: String(a.PERMIT_SUB_TYPE ?? a.permit_sub_type ?? ''),
            status: String(a.STATUS ?? a.status ?? ''),
            issueDate: String(a.ISSUE_DATE ?? a.issue_date ?? ''),
            address: String(a.ADDRESS ?? a.address ?? ''),
            workDescription: String(a.WORK_DESC ?? a.work_desc ?? ''),
          }
        }),
      }
      console.log(`[TOOL:fetchPermits] ✓ ${result.totalPermits} permits found`)
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[TOOL:fetchPermits] ✗ Error:`, msg)
      return { error: msg, source: "ladbs_permits" }
    }
  },
})
