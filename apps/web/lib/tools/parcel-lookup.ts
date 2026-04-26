import { tool } from "ai"
import { z } from "zod"
import { LA_SOCRATA_BASE, LA_SOCRATA_DATASETS } from "@/lib/config/data-sources"

export const parcelLookupTool = tool({
  description:
    "Fetch LA parcel data by coordinates. Returns zoning, lot area, and parcel geometry from LA City Open Data.",
  inputSchema: z.object({
    lat: z.number().describe("Latitude"),
    lng: z.number().describe("Longitude"),
  }),
  execute: async ({ lat, lng }) => {
    console.log(`\n[TOOL:fetchParcelData] ▶ Input: lat=${lat} lng=${lng}`)
    try {
      const url = new URL(`${LA_SOCRATA_BASE}/${LA_SOCRATA_DATASETS.parcels}.geojson`)
      url.searchParams.set('$where', `within_circle(the_geom, ${lat}, ${lng}, 60)`)
      url.searchParams.set('$order', 'shape_area ASC')
      url.searchParams.set('$limit', '1')

      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) throw new Error(`LA parcels HTTP ${res.status}`)
      const data = await res.json() as GeoJSON.FeatureCollection
      const feature = data.features?.[0]
      if (!feature) {
        console.warn(`[TOOL:fetchParcelData] ✗ No parcel found near ${lat},${lng}`)
        return { error: `No parcel found near coordinates`, source: "la_parcels" }
      }
      const p = feature.properties ?? {}
      const result = {
        lotArea: toNumber(p.shape_area),
        apn: String(p.apn ?? p.ain ?? 'Unknown'),
        address: String(p.situs_addr ?? p.address ?? 'Unknown'),
      }
      console.log(`[TOOL:fetchParcelData] ✓ APN=${result.apn} area=${result.lotArea}`)
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[TOOL:fetchParcelData] ✗ Error:`, msg)
      return { error: msg, source: "la_parcels" }
    }
  },
})

function toNumber(value: unknown) {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number.parseFloat(value) || 0
  return 0
}
