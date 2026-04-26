import { tool } from "ai"
import { z } from "zod"
import { fetchFairMarketRent, isHudError } from "@/lib/api/hud"

export const rentTool = tool({
  description:
    "Fetch HUD Fair Market Rent data for the Los Angeles metro area. Returns rent amounts by bedroom count (efficiency through 4BR).",
  inputSchema: z.object({
    area: z
      .string()
      .default("Los Angeles")
      .describe("Area name — defaults to Los Angeles County"),
  }),
  execute: async ({ area }) => {
    console.log(`\n[TOOL:fetchRentData] ▶ Input: area="${area}"`)
    const result = await fetchFairMarketRent(area)
    if (isHudError(result)) {
      console.error(`[TOOL:fetchRentData] ✗ Error:`, result.error)
      return result
    }
    console.log(`[TOOL:fetchRentData] ✓ 1BR=$${result.oneBr} 2BR=$${result.twoBr} area=${result.areaName}`)
    return result
  },
})
