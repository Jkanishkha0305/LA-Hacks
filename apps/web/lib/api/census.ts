import { CENSUS_BASE_URL, FCC_GEOCODER_URL } from "@/lib/config/data-sources"
import { env } from "@/lib/config/env"
import type { CensusData } from "@/lib/types/property"
import type { FccGeocoderResponse } from "@/lib/types/api-responses"

export interface CensusError {
  error: string
  source: "census"
}

/** Reverse-geocode lat/lng to FIPS codes via FCC geocoder */
async function getFipsCodes(
  lat: number,
  lng: number,
): Promise<{ state: string; county: string; tract: string } | CensusError> {
  const url = new URL(FCC_GEOCODER_URL)
  url.searchParams.set("latitude", lat.toString())
  url.searchParams.set("longitude", lng.toString())
  url.searchParams.set("format", "json")
  url.searchParams.set("showall", "false")

  console.log(`[API:FCC] Reverse geocode: lat=${lat}, lng=${lng}`)

  try {
    const res = await fetch(url.toString())
    console.log(`[API:FCC] Response: ${res.status}`)
    if (!res.ok) {
      console.error(`[API:FCC] ERROR: ${res.status}`)
      return { error: `FCC geocoder ${res.status}`, source: "census" }
    }
    const data = (await res.json()) as FccGeocoderResponse
    if (!data.Block?.FIPS) {
      console.warn(`[API:FCC] No FIPS data in response:`, JSON.stringify(data).slice(0, 300))
      return { error: "No FIPS data for coordinates", source: "census" }
    }
    const fips = data.Block.FIPS
    const result = {
      state: fips.slice(0, 2),
      county: fips.slice(2, 5),
      tract: fips.slice(5, 11),
    }
    console.log(`[API:FCC] FIPS: ${fips} → state=${result.state}, county=${result.county}, tract=${result.tract}`)
    return result
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error"
    console.error(`[API:FCC] FETCH ERROR: ${message}`)
    return { error: `FCC geocoder failed: ${message}`, source: "census" }
  }
}

/** Fetch median household income (B19013_001E) for a census tract */
export async function fetchCensusIncome(
  lat: number,
  lng: number,
): Promise<CensusData | CensusError> {
  const fips = await getFipsCodes(lat, lng)
  if ("error" in fips) return fips

  const url = new URL(CENSUS_BASE_URL)
  url.searchParams.set("get", "B19013_001E")
  url.searchParams.set("for", `tract:${fips.tract}`)
  url.searchParams.set("in", `state:${fips.state}+county:${fips.county}`)
  if (env.CENSUS_API_KEY) {
    url.searchParams.set("key", env.CENSUS_API_KEY)
  }

  console.log(`[API:Census] ACS query: state=${fips.state}, county=${fips.county}, tract=${fips.tract}`)

  try {
    const res = await fetch(url.toString())
    console.log(`[API:Census] Response: ${res.status}`)
    if (!res.ok) {
      console.error(`[API:Census] ERROR: ${res.status}`)
      return { error: `Census API ${res.status}`, source: "census" }
    }
    const rows = (await res.json()) as string[][]
    console.log(`[API:Census] Raw data:`, JSON.stringify(rows))
    // First row is header, second is data
    const income = rows[1]?.[0]
    const parsed = income ? parseInt(income, 10) : null

    const result = {
      medianHouseholdIncome: parsed && !isNaN(parsed) ? parsed : null,
      tract: fips.tract,
      state: fips.state,
      county: fips.county,
    }
    console.log(`[API:Census] Median household income: $${result.medianHouseholdIncome}`)
    return result
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error"
    console.error(`[API:Census] FETCH ERROR: ${message}`)
    return { error: `Census API failed: ${message}`, source: "census" }
  }
}

export function isCensusError(
  result: unknown,
): result is CensusError {
  return (
    typeof result === "object" &&
    result !== null &&
    "error" in result &&
    (result as CensusError).source === "census"
  )
}
