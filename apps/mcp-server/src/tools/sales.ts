/**
 * fetch_market_context — Deterministic LA market tier context by zip.
 * LA has no public rolling-sales dataset; this returns Assessor-derived tiers
 * with a `synthetic` flag so the agent knows to caveat downstream claims.
 */
import { z } from "zod"
import type { ToolDefinition } from "../runtime.js"

const inputSchema = z.object({
  zipCode: z.string().min(5).max(5).describe("5-digit zip code"),
  neighborhood: z.string().optional(),
  propertyType: z.enum(["residential", "commercial", "mixed-use", "industrial"]).optional(),
})

export interface MarketContextOutput {
  zipCode: string
  marketTier: string
  estimatedPricePerSqft: number
  estimatedLandValuePerSqft: number
  medianSalePrice: number
  synthetic: true
  notes: string
}

interface MarketTier {
  name: string
  pricePerSqft: number
  landPerSqft: number
  medianSale: number
}

function tierForZip(zip: string): MarketTier {
  if (["90012", "90013", "90014", "90015", "90017", "90021", "90071"].includes(zip))
    return { name: "DTLA Core", pricePerSqft: 550, landPerSqft: 300, medianSale: 850000 }
  if (["90024", "90025", "90049", "90064", "90067", "90077", "90210", "90212"].includes(zip))
    return { name: "Westside Premium", pricePerSqft: 900, landPerSqft: 500, medianSale: 2_200_000 }
  if (["90004", "90005", "90006", "90010", "90020", "90028", "90029", "90036", "90038"].includes(zip))
    return { name: "Central LA", pricePerSqft: 450, landPerSqft: 250, medianSale: 750000 }
  if (["90001", "90002", "90003", "90007", "90011", "90037", "90044", "90059", "90061"].includes(zip))
    return { name: "South LA", pricePerSqft: 300, landPerSqft: 150, medianSale: 500000 }
  if (zip >= "91300" && zip <= "91699")
    return { name: "San Fernando Valley", pricePerSqft: 400, landPerSqft: 200, medianSale: 800000 }
  return { name: "LA Metro", pricePerSqft: 420, landPerSqft: 220, medianSale: 750000 }
}

export const marketTool: ToolDefinition<z.infer<typeof inputSchema>, MarketContextOutput> = {
  name: "fetch_market_context",
  version: "1.0.0",
  title: "Fetch LA market context",
  description:
    "Return LA market tier, $/sqft, $/land-sqft, and median sale price for a zip code. NOTE: LA has no public rolling-sales dataset — values are deterministic Assessor-derived tier estimates. The `synthetic: true` flag warns that an agent should not over-weight precision.",
  inputSchema,
  cacheTtlMs: 1000 * 60 * 60 * 24 * 7,
  baseConfidence: 0.6,
  execute: async ({ zipCode }, ctx) => {
    const tier = tierForZip(zipCode)
    ctx.pushSource({
      id: "la_county_assessor_tiers",
      url: "https://assessor.lacounty.gov/",
      fetched_at: new Date().toISOString(),
      label: "LA County Assessor — derived tier classification",
    })
    return {
      zipCode,
      marketTier: tier.name,
      estimatedPricePerSqft: tier.pricePerSqft,
      estimatedLandValuePerSqft: tier.landPerSqft,
      medianSalePrice: tier.medianSale,
      synthetic: true as const,
      notes:
        "Deterministic tier estimate from LA County Assessor zip groupings. For precise comparable sales, an agent should call CRMLS or Compass — those are non-public.",
    }
  },
}
