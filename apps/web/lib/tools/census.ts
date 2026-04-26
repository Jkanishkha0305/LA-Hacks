import { tool } from "ai"
import { z } from "zod"
import { fetchCensusIncome, isCensusError } from "@/lib/api/census"

export const censusTool = tool({
  description:
    "Fetch Census ACS median household income for the census tract at a given location.",
  inputSchema: z.object({
    lat: z.number().describe("Latitude"),
    lng: z.number().describe("Longitude"),
  }),
  execute: async ({ lat, lng }) => {
    console.log(`\n[TOOL:fetchCensusData] ▶ Input: lat=${lat} lng=${lng}`)
    const result = await fetchCensusIncome(lat, lng)
    if (isCensusError(result)) {
      console.error(`[TOOL:fetchCensusData] ✗ Error:`, result.error)
      return result
    }
    console.log(`[TOOL:fetchCensusData] ✓ Median income=$${result.medianHouseholdIncome} tract=${result.tract}`)
    return result
  },
})
