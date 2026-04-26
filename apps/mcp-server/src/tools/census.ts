/**
 * fetch_census_income — Median household income for the census tract at a coord.
 * Two upstream calls: FCC block lookup → Census ACS B19013_001E.
 */
import { z } from "zod"
import { CENSUS_BASE_URL, FCC_GEOCODER_URL, env, withTimeout } from "../config.js"
import type { ToolDefinition } from "../runtime.js"

const inputSchema = z.object({
  lat: z.number(),
  lng: z.number(),
})

export interface CensusOutput {
  medianHouseholdIncome: number | null
  state: string
  county: string
  tract: string
  blockGroup: string | null
}

export const censusTool: ToolDefinition<z.infer<typeof inputSchema>, CensusOutput> = {
  name: "fetch_census_income",
  version: "1.0.0",
  title: "Fetch census tract income",
  description:
    "Fetch ACS 5-year median household income for the census tract containing a coordinate. Two-step: FCC block geocoder → Census ACS B19013_001E.",
  inputSchema,
  cacheTtlMs: 1000 * 60 * 60 * 24 * 30,
  execute: async ({ lat, lng }, ctx) => {
    // Step 1: FCC block lookup → state/county/tract codes.
    const fccUrl = new URL(FCC_GEOCODER_URL)
    fccUrl.searchParams.set("latitude", String(lat))
    fccUrl.searchParams.set("longitude", String(lng))
    fccUrl.searchParams.set("format", "json")
    const fccRes = await ctx.trackedFetch(fccUrl.toString(), {
      signal: withTimeout(8000),
      sourceId: "fcc_block_geocoder",
      sourceLabel: "FCC Block API",
    })
    if (!fccRes.ok) throw new Error(`FCC HTTP ${fccRes.status}`)
    const fcc = (await fccRes.json()) as {
      Block?: { FIPS?: string }
      County?: { FIPS?: string; name?: string }
      State?: { FIPS?: string; code?: string }
    }
    const blockFips = fcc.Block?.FIPS
    if (!blockFips) throw new Error(`FCC returned no block for ${lat},${lng}`)
    const state = blockFips.slice(0, 2)
    const county = blockFips.slice(2, 5)
    const tract = blockFips.slice(5, 11)
    const blockGroup = blockFips.slice(11, 12) || null

    // Step 2: Census ACS — median household income (B19013_001E).
    const acsUrl = new URL(CENSUS_BASE_URL)
    acsUrl.searchParams.set("get", "B19013_001E,NAME")
    acsUrl.searchParams.set("for", `tract:${tract}`)
    acsUrl.searchParams.set("in", `state:${state} county:${county}`)
    if (env.CENSUS_API_KEY) acsUrl.searchParams.set("key", env.CENSUS_API_KEY)
    const acsRes = await ctx.trackedFetch(acsUrl.toString(), {
      signal: withTimeout(8000),
      sourceId: "us_census_acs5",
      sourceLabel: "US Census ACS 5-Year (B19013_001E)",
    })
    if (!acsRes.ok) throw new Error(`Census ACS HTTP ${acsRes.status}`)
    const rows = (await acsRes.json()) as Array<Array<string>>
    const dataRow = rows[1] // first row is header
    const median = dataRow ? Number.parseInt(dataRow[0] ?? "0") : NaN

    return {
      medianHouseholdIncome: Number.isFinite(median) && median > 0 ? median : null,
      state,
      county,
      tract,
      blockGroup,
    }
  },
}
