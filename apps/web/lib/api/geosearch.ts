import type { GeocodedAddress } from "@/lib/types/property"
import type { GeoSearchResult } from '../types'

// ── Server-side: full geocode (used by scaffold tools & routes) ──

export interface GeoSearchError {
  error: string
  source: "geosearch"
}

export async function geocodeAddress(
  address: string,
): Promise<GeocodedAddress | GeoSearchError> {
  const normalized = normalizeLAQuery(address)

  try {
    const googleResult = await geocodeWithGoogle(normalized)
    const result = googleResult ?? await fallbackGeocode(normalized)

    if (!result) {
      return { error: `No LA results for "${address}"`, source: "geosearch" }
    }

    return {
      bbl: result.bbl,
      bin: result.bbl,
      lat: result.coordinates[1],
      lng: result.coordinates[0],
      borough: result.borough,
      block: result.bbl,
      lot: "LA",
      zipCode: extractZip(result.label) ?? "90012",
      label: result.label,
      neighbourhood: null,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error"
    console.error(`[API:GeoSearch] FETCH ERROR: ${message}`)
    return { error: `GeoSearch failed: ${message}`, source: "geosearch" }
  }
}

async function geocodeWithGoogle(address: string): Promise<GeoSearchResult | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return null

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json")
  url.searchParams.set("address", address)
  url.searchParams.set("components", "locality:Los Angeles|administrative_area:CA|country:US")
  url.searchParams.set("bounds", "33.70,-118.70|34.40,-118.10")
  url.searchParams.set("key", apiKey)

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`Google Geocoding ${res.status}`)

  const data = await res.json() as {
    status: string
    results?: Array<{
      formatted_address: string
      place_id: string
      geometry: { location: { lat: number; lng: number } }
      address_components?: Array<{ long_name: string; short_name: string; types: string[] }>
    }>
  }

  if (data.status !== "OK" || !data.results?.[0]) return null

  const result = data.results.find((candidate) => isInLABounds(
    candidate.geometry.location.lat,
    candidate.geometry.location.lng,
  )) ?? data.results[0]

  const { lat, lng } = result.geometry.location
  if (!isInLABounds(lat, lng)) return null

  return {
    label: result.formatted_address,
    name: stripLosAngelesSuffix(result.formatted_address),
    borough: "Los Angeles",
    bbl: `LA-${result.place_id.slice(0, 18)}`,
    coordinates: [lng, lat],
  }
}

async function fallbackGeocode(address: string): Promise<GeoSearchResult | null> {
  const exact = LOCAL_LA_ADDRESSES.find((candidate) =>
    candidate.label.toLowerCase().includes(address.toLowerCase()) ||
    address.toLowerCase().includes(candidate.name.toLowerCase()),
  )
  if (exact) return exact

  if (!looksLikeLAAddress(address)) return null

  // Try US Census geocoder (free, no API key required)
  const censusResult = await geocodeWithCensus(address)
  if (censusResult) return censusResult

  return makeSyntheticLAResult(address)
}

async function geocodeWithCensus(address: string): Promise<GeoSearchResult | null> {
  try {
    const url = new URL("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress")
    url.searchParams.set("address", address)
    url.searchParams.set("benchmark", "Public_AR_Current")
    url.searchParams.set("format", "json")

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null

    const data = await res.json() as {
      result?: {
        addressMatches?: Array<{
          matchedAddress: string
          coordinates: { x: number; y: number }
        }>
      }
    }

    const match = data.result?.addressMatches?.[0]
    if (!match) return null

    const { x: lng, y: lat } = match.coordinates
    if (!isInLABounds(lat, lng)) return null

    const label = match.matchedAddress
    return {
      label,
      name: stripLosAngelesSuffix(label),
      borough: "Los Angeles",
      bbl: `LA-CENSUS-${stableHash(label).toString(36).toUpperCase()}`,
      coordinates: [lng, lat],
    }
  } catch {
    return null
  }
}

function normalizeLAQuery(text: string) {
  const trimmed = text.trim().replace(/\s+/g, " ")
  if (/\b(los angeles|la|ca|california)\b/i.test(trimmed)) return trimmed
  return `${trimmed}, Los Angeles, CA`
}

function looksLikeLAAddress(text: string) {
  return (
    /\d+/.test(text) &&
    /\b(st|street|ave|avenue|blvd|boulevard|dr|drive|rd|road|way|pl|place|ct|court|ln|lane)\b/i.test(text)
  )
}

function makeSyntheticLAResult(address: string): GeoSearchResult {
  const hash = stableHash(address)
  const lat = 34.0522 + ((hash % 1200) - 600) / 100000
  const lng = -118.2437 + (((hash >> 8) % 1600) - 800) / 100000
  const label = normalizeLAQuery(address)
  return {
    label,
    name: stripLosAngelesSuffix(label),
    borough: "Los Angeles",
    bbl: `LA-DEMO-${hash.toString(36).toUpperCase()}`,
    coordinates: [lng, lat],
  }
}

function isInLABounds(lat: number, lng: number) {
  return lat >= 33.7 && lat <= 34.4 && lng >= -118.7 && lng <= -118.1
}

function extractZip(label: string) {
  return label.match(/\b9\d{4}\b/)?.[0] ?? null
}

function stripLosAngelesSuffix(label: string) {
  return label.replace(/,\s*Los Angeles,?\s*CA\s*\d{0,5},?\s*USA?$/i, "").trim()
}

function stableHash(text: string) {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const LOCAL_LA_ADDRESSES: GeoSearchResult[] = [
  { label: "350 S Grand Ave, Los Angeles, CA 90071", name: "350 S Grand Ave", borough: "Los Angeles", bbl: "LA-DEMO-GRAND", coordinates: [-118.2519, 34.0522] },
  { label: "633 W 5th St, Los Angeles, CA 90071", name: "633 W 5th St", borough: "Los Angeles", bbl: "LA-DEMO-FIFTH", coordinates: [-118.2470, 34.0518] },
  { label: "200 N Spring St, Los Angeles, CA 90012", name: "200 N Spring St", borough: "Los Angeles", bbl: "LA-DEMO-SPRING", coordinates: [-118.2437, 34.0544] },
  { label: "1111 S Figueroa St, Los Angeles, CA 90015", name: "1111 S Figueroa St", borough: "Los Angeles", bbl: "LA-DEMO-FIGUEROA", coordinates: [-118.2839, 34.0430] },
  { label: "700 World Way, Los Angeles, CA 90045", name: "700 World Way", borough: "Los Angeles", bbl: "LA-DEMO-LAX", coordinates: [-118.4081, 33.9425] },
]

export function isGeoSearchError(
  result: unknown,
): result is GeoSearchError {
  return (
    typeof result === "object" &&
    result !== null &&
    "error" in result &&
    "source" in result
  )
}

// ── Client-side: autocomplete (used by AddressSearch component) ──

/**
 * Search LA addresses through the local API. The API uses Google Maps when a
 * key is configured, and falls back to demo-safe LA results when it is not.
 */
export async function searchAddress(text: string): Promise<GeoSearchResult[]> {
  const query = text.trim()
  if (query.length < 3) return []

  const localMatches = LOCAL_LA_ADDRESSES.filter((addr) =>
    `${addr.label} ${addr.name}`.toLowerCase().includes(query.toLowerCase()),
  )

  const res = await fetch(`/api/geocode?address=${encodeURIComponent(query)}`)
  if (!res.ok) {
    return localMatches.length > 0 ? localMatches : []
  }

  const geocoded = await res.json() as GeocodedAddress
  const apiResult: GeoSearchResult = {
    label: geocoded.label,
    name: stripLosAngelesSuffix(geocoded.label),
    borough: geocoded.borough || "Los Angeles",
    bbl: geocoded.bbl,
    coordinates: [geocoded.lng, geocoded.lat],
  }

  const byId = new Map<string, GeoSearchResult>()
  for (const result of [apiResult, ...localMatches]) {
    byId.set(result.bbl, result)
  }
  return [...byId.values()]
}

/**
 * LA-specific address geocoding using the server-side geocoder.
 */
export async function geocodeLAAddress(
  address: string,
): Promise<{ lat: number; lng: number; address: string } | null> {
  const result = await geocodeAddress(address)
  if (isGeoSearchError(result)) return null

  return {
    lat: result.lat,
    lng: result.lng,
    address: result.label,
  }
}
