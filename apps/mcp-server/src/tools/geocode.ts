/**
 * geocode_address — Convert an LA street address to coordinates + APN-style id.
 * Tries Google (if key configured), falls back to US Census geocoder (free).
 */
import { z } from "zod"
import {
  CENSUS_GEOCODER_URL,
  GOOGLE_GEOCODER_URL,
  env,
  withTimeout,
} from "../config.js"
import type { ToolDefinition } from "../runtime.js"

const inputSchema = z.object({
  address: z
    .string()
    .min(3)
    .describe("Los Angeles street address, e.g. '350 S Grand Ave, Los Angeles, CA'."),
})

export interface GeocodeOutput {
  address: string
  lat: number
  lng: number
  bbl: string
  zipCode: string | null
  borough: string
  source: "google" | "census" | "synthetic"
}

const LA_BOUNDS = { minLat: 33.7, maxLat: 34.4, minLng: -118.7, maxLng: -118.1 }
function inLABounds(lat: number, lng: number): boolean {
  return lat >= LA_BOUNDS.minLat && lat <= LA_BOUNDS.maxLat && lng >= LA_BOUNDS.minLng && lng <= LA_BOUNDS.maxLng
}

function normalizeQuery(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ")
  return /\b(los angeles|la|ca|california)\b/i.test(trimmed) ? trimmed : `${trimmed}, Los Angeles, CA`
}

function extractZip(s: string): string | null {
  return s.match(/\b9\d{4}\b/)?.[0] ?? null
}

export const geocodeTool: ToolDefinition<z.infer<typeof inputSchema>, GeocodeOutput> = {
  name: "geocode_address",
  version: "1.0.0",
  title: "Geocode LA address",
  description:
    "Geocode a Los Angeles street address. Returns coordinates, parcel identifier (BBL), zip, and borough. Always call this FIRST — every spatial tool downstream needs lat/lng.",
  inputSchema,
  cacheTtlMs: 1000 * 60 * 60 * 24 * 30, // addresses don't move — 30 day cache
  execute: async ({ address }, ctx) => {
    const normalized = normalizeQuery(address)

    // Try Google first if key is configured.
    if (env.GOOGLE_MAPS_API_KEY) {
      const url = new URL(GOOGLE_GEOCODER_URL)
      url.searchParams.set("address", normalized)
      url.searchParams.set("components", "locality:Los Angeles|administrative_area:CA|country:US")
      url.searchParams.set("bounds", "33.70,-118.70|34.40,-118.10")
      url.searchParams.set("key", env.GOOGLE_MAPS_API_KEY)
      const res = await ctx.trackedFetch(url.toString(), {
        signal: withTimeout(8000),
        sourceId: "google_geocoder",
        sourceLabel: "Google Maps Geocoding API",
      })
      if (res.ok) {
        const data = (await res.json()) as {
          status: string
          results?: Array<{
            formatted_address: string
            place_id: string
            geometry: { location: { lat: number; lng: number } }
          }>
        }
        if (data.status === "OK" && data.results?.[0]) {
          const r = data.results.find((c) => inLABounds(c.geometry.location.lat, c.geometry.location.lng)) ?? data.results[0]
          if (r && inLABounds(r.geometry.location.lat, r.geometry.location.lng)) {
            return {
              address: r.formatted_address,
              lat: r.geometry.location.lat,
              lng: r.geometry.location.lng,
              bbl: `LA-${r.place_id.slice(0, 18)}`,
              zipCode: extractZip(r.formatted_address),
              borough: "Los Angeles",
              source: "google" as const,
            }
          }
        }
      }
    }

    // Fall back to US Census geocoder (free, no key).
    const censusUrl = new URL(CENSUS_GEOCODER_URL)
    censusUrl.searchParams.set("address", normalized)
    censusUrl.searchParams.set("benchmark", "Public_AR_Current")
    censusUrl.searchParams.set("format", "json")
    const censusRes = await ctx.trackedFetch(censusUrl.toString(), {
      signal: withTimeout(8000),
      sourceId: "us_census_geocoder",
      sourceLabel: "US Census Geocoder",
    })
    if (!censusRes.ok) throw new Error(`Census geocoder HTTP ${censusRes.status}`)
    const json = (await censusRes.json()) as {
      result?: {
        addressMatches?: Array<{
          matchedAddress: string
          coordinates: { x: number; y: number }
        }>
      }
    }
    const match = json.result?.addressMatches?.[0]
    if (!match) throw new Error(`No geocode match for "${address}"`)
    const lat = match.coordinates.y
    const lng = match.coordinates.x
    if (!inLABounds(lat, lng)) {
      throw new Error(`Address resolved outside LA bounds: ${match.matchedAddress}`)
    }
    return {
      address: match.matchedAddress,
      lat,
      lng,
      bbl: `LA-CENSUS-${Buffer.from(match.matchedAddress).toString("base64url").slice(0, 18)}`,
      zipCode: extractZip(match.matchedAddress),
      borough: "Los Angeles",
      source: "census" as const,
    }
  },
}
