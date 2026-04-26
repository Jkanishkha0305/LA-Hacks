/**
 * fetch_parcel — Pull LA City parcel record by coordinate. Returns APN, zoning,
 * lot area, and the parcel address as recorded by LA.
 */
import { z } from "zod"
import { LA_SOCRATA_BASE, LA_SOCRATA_DATASETS, env, withTimeout } from "../config.js"
import type { ToolDefinition } from "../runtime.js"

const inputSchema = z.object({
  lat: z.number().min(-90).max(90).describe("Latitude (WGS84)"),
  lng: z.number().min(-180).max(180).describe("Longitude (WGS84)"),
})

export interface ParcelOutput {
  apn: string
  address: string
  zoning: string | null
  lotAreaSqft: number
  lotAreaAcres: number
  matchedDistanceMeters: number
}

function num(v: unknown): number {
  if (typeof v === "number") return v
  if (typeof v === "string") return Number.parseFloat(v) || 0
  return 0
}

export const parcelTool: ToolDefinition<z.infer<typeof inputSchema>, ParcelOutput> = {
  name: "fetch_parcel",
  version: "1.0.0",
  title: "Fetch LA parcel record",
  description:
    "Fetch the LA City parcel record nearest a coordinate. Returns APN (Assessor Parcel Number), zoning code, lot area in sqft and acres. Source: data.lacity.org/qyra-qm2s.",
  inputSchema,
  execute: async ({ lat, lng }, ctx) => {
    const url = new URL(`${LA_SOCRATA_BASE}/${LA_SOCRATA_DATASETS.parcels}.geojson`)
    url.searchParams.set("$where", `within_circle(the_geom, ${lat}, ${lng}, 60)`)
    url.searchParams.set("$order", "shape_area ASC")
    url.searchParams.set("$limit", "1")
    if (env.SOCRATA_APP_TOKEN) url.searchParams.set("$$app_token", env.SOCRATA_APP_TOKEN)

    const res = await ctx.trackedFetch(url.toString(), {
      signal: withTimeout(10_000),
      sourceId: "lacity_socrata:qyra-qm2s",
      sourceLabel: "LA City Parcels (Socrata)",
    })
    if (!res.ok) throw new Error(`LA parcels HTTP ${res.status}`)
    const data = (await res.json()) as {
      features?: Array<{ properties?: Record<string, unknown> }>
    }
    const feature = data.features?.[0]
    if (!feature) throw new Error(`No parcel found near ${lat},${lng}`)
    const p = feature.properties ?? {}
    const lotAreaSqft = num(p.shape_area)
    return {
      apn: String(p.apn ?? p.ain ?? "Unknown"),
      address: String(p.situs_addr ?? p.address ?? "Unknown"),
      zoning: typeof p.zoning === "string" ? p.zoning : null,
      lotAreaSqft,
      lotAreaAcres: lotAreaSqft / 43_560,
      matchedDistanceMeters: 0, // socrata within_circle doesn't return distance; placeholder
    }
  },
}
