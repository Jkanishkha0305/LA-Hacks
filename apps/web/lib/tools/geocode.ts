import { tool } from "ai"
import { z } from "zod"
import {
  geocodeAddress,
  isGeoSearchError,
} from "@/lib/api/geosearch"

export const geocodeTool = tool({
  description:
    "Geocode a Los Angeles address to get a parcel identifier, coordinates, city, zip code, and neighborhood. Always call this first to get identifiers for other tools.",
  inputSchema: z.object({
    address: z
      .string()
      .describe("Los Angeles street address, e.g. '350 S Grand Ave' or '200 N Spring St'"),
  }),
  execute: async ({ address }) => {
    console.log(`\n[TOOL:geocodeAddress] ▶ Input: address="${address}"`)
    const result = await geocodeAddress(address)
    if (isGeoSearchError(result)) {
      console.error(`[TOOL:geocodeAddress] ✗ Error:`, result.error)
      return result
    }
    console.log(`[TOOL:geocodeAddress] ✓ BBL=${result.bbl} BIN=${result.bin} lat=${result.lat} lng=${result.lng} borough=${result.borough} zip=${result.zipCode}`)
    return result
  },
})
