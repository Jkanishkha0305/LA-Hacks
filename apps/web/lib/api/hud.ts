import { HUD_FMR_BASE_URL } from "@/lib/config/data-sources"
import { env } from "@/lib/config/env"
import type { RentData } from "@/lib/types/property"

export interface HudError {
  error: string
  source: "hud"
}

/** LA area name to HUD county FIPS entity ID mapping */
const LA_AREA_TO_FIPS: Record<string, string> = {
  "Los Angeles": "0603799999",
  "LA": "0603799999",
  "LA County": "0603799999",
  "Los Angeles County": "0603799999",
  "Orange County": "0605999999",
  "Ventura": "0611199999",
  "San Bernardino": "0607199999",
  "Riverside": "0606599999",
}

/**
 * Fetch HUD FMR data by LA area name.
 * HUD API uses county FIPS entity IDs.
 */
export async function fetchFairMarketRent(
  area: string,
): Promise<RentData | HudError> {
  if (!env.HUD_API_TOKEN) {
    return { error: "HUD_API_TOKEN is not configured", source: "hud" }
  }

  const entityId = LA_AREA_TO_FIPS[area] ?? LA_AREA_TO_FIPS["Los Angeles"]
  if (!entityId) {
    console.error(`[API:HUD] Unknown area: "${area}". Known: ${Object.keys(LA_AREA_TO_FIPS).join(", ")}`)
    return { error: `Unknown area: ${area}`, source: "hud" }
  }

  const url = `${HUD_FMR_BASE_URL}/${entityId}`
  console.log(`[API:HUD] Area: ${area} → FIPS: ${entityId} | URL: ${url}`)

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${env.HUD_API_TOKEN}` },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    console.log(`[API:HUD] Response: ${res.status} ${res.statusText}`)

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      console.error(`[API:HUD] ERROR ${res.status}: ${body.slice(0, 300)}`)
      return { error: `HUD API ${res.status}: ${res.statusText}`, source: "hud" }
    }

    const json = await res.json()
    const fmr = json.data?.basicdata

    if (!fmr) {
      console.warn(`[API:HUD] No basicdata in response:`, JSON.stringify(json).slice(0, 500))
      return { error: `No FMR data for ${area}`, source: "hud" }
    }

    const result = {
      zipCode: area,
      efficiency: fmr.Efficiency ?? null,
      oneBr: fmr["One-Bedroom"] ?? null,
      twoBr: fmr["Two-Bedroom"] ?? null,
      threeBr: fmr["Three-Bedroom"] ?? null,
      fourBr: fmr["Four-Bedroom"] ?? null,
      areaName: json.data?.area_name ?? null,
      year: parseInt(fmr.year) || null,
    }
    console.log(`[API:HUD] FMR for ${area}:`, JSON.stringify(result))
    return result
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error"
    console.error(`[API:HUD] FETCH ERROR: ${message}`)
    return { error: `HUD API failed: ${message}`, source: "hud" }
  }
}

export function isHudError(result: unknown): result is HudError {
  return (
    typeof result === "object" &&
    result !== null &&
    "error" in result &&
    (result as HudError).source === "hud"
  )
}
