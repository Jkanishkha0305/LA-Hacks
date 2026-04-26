/**
 * Compute effective maxFAR based on zoning district type.
 *
 * MX districts (e.g., M1-4/R7A) allow summing commercial + residential FAR.
 * Pure residential/commercial districts use the applicable FAR only.
 *
 * This is critical for Gowanus demo parcels — the area was rezoned as MX,
 * so using max() instead of sum would significantly understate buildable SF.
 */
export function computeMaxFAR(
  zoningDistrict: string,
  residFAR: number,
  commFAR: number,
  facilFAR: number,
): number {
  const isMixedUse = /^M\d.*\/R\d/.test(zoningDistrict) // M1-4/R7A pattern
  if (isMixedUse) return residFAR + commFAR
  if (zoningDistrict.startsWith('R')) return Math.max(residFAR, facilFAR)
  if (zoningDistrict.startsWith('C') || zoningDistrict.startsWith('M'))
    return Math.max(commFAR, facilFAR)
  return Math.max(residFAR, commFAR, facilFAR) // fallback
}

/**
 * Compute development potential score.
 *
 * Composite of FAR upside x lot area, penalized by constraints.
 * Thresholds calibrated to urban infill development economics:
 *   - 100K+ SF adjusted potential -> high
 *   - 30K-100K SF -> med
 *   - <30K SF -> low
 */
export function computeScore(
  farUpside: number,
  lotArea: number,
  constraintCount: number,
): 'high' | 'med' | 'low' {
  const rawScore = farUpside * lotArea
  const penalty = constraintCount * 0.15 // 15% penalty per constraint
  const adjustedScore = rawScore * (1 - penalty)

  if (adjustedScore >= 100_000) return 'high'
  if (adjustedScore >= 30_000) return 'med'
  return 'low'
}

// ── TOC Scenario Computation ──

/** Approximate bonus FAR by base zoning district. */
const MIH_BONUS_TABLE: Record<string, number> = {
  R6: 3.6,
  R6A: 3.6,
  R6B: 2.2,
  R7A: 4.6,
  R7D: 5.6,
  R7X: 6.0,
  R8: 7.2,
  R8A: 7.2,
  R9: 9.0,
  R9A: 9.0,
  R10: 12.0,
}

/** TOC affordability requirement demo scenarios. */
const MIH_OPTIONS: Record<string, { affordabilityPct: number; amiLevel: string }> = {
  'Option 1': { affordabilityPct: 0.25, amiLevel: '60% AMI' },
  'Option 2': { affordabilityPct: 0.30, amiLevel: '80% AMI' },
  'Deep Affordability': { affordabilityPct: 0.20, amiLevel: '40% AMI' },
  'Workforce': { affordabilityPct: 0.30, amiLevel: '115% AMI' },
}

const EFFICIENCY_RATIO = 0.80
const AVG_UNIT_SIZE_SF = 850

/**
 * Extract the R-district from a zoning string.
 * For MX districts like "M1-4/R7A", returns "R7A".
 * For pure R districts like "R7A", returns "R7A".
 */
function extractRDistrict(zoningDistrict: string): string | null {
  const mxMatch = zoningDistrict.match(/\/(R\d+\w?)/)
  if (mxMatch) return mxMatch[1]!
  if (zoningDistrict.startsWith('R')) return zoningDistrict.replace(/^(R\d+\w?).*/, '$1')
  return null
}

/**
 * Parse an incentive rule string into applicable affordability option names.
 * Falls back to ["Option 1", "Option 2"] when the string is ambiguous.
 */
export function parseMIHOptions(ihRules: string): string[] {
  const normalized = ihRules.toLowerCase()
  const found: string[] = []

  if (normalized.includes('option 1')) found.push('Option 1')
  if (normalized.includes('option 2')) found.push('Option 2')
  if (normalized.includes('deep affordability')) found.push('Deep Affordability')
  if (normalized.includes('workforce')) found.push('Workforce')

  return found.length > 0 ? found : ['Option 1', 'Option 2']
}

export interface DevelopmentScenario {
  name: string
  maxFAR: number
  mihBonusFAR: number
  maxBuildableSF: number
  affordabilityReq: string
  estimatedUnits: number
  marketRateUnits: number
  affordableUnits: number
  interpretation: string
  isAIEstimate?: boolean
}

/**
 * Compute TOC development scenarios for a parcel.
 * Returns one scenario per applicable affordability option.
 * All numeric values are deterministic when the district is in the lookup table.
 */
export function computeScenarios(
  zoningDistrict: string,
  lotArea: number,
  baseMaxFAR: number,
  builtFAR: number,
  ihRules: string,
): DevelopmentScenario[] {
  const rDistrict = extractRDistrict(zoningDistrict)
  const mihMaxFAR = rDistrict ? MIH_BONUS_TABLE[rDistrict] ?? null : null
  const options = parseMIHOptions(ihRules)

  return options.map(optionName => {
    const option = MIH_OPTIONS[optionName]!
    const isAIEstimate = mihMaxFAR === null
    const scenarioMaxFAR = mihMaxFAR ?? baseMaxFAR * 1.2 // rough fallback for AI to refine
    const bonusFAR = scenarioMaxFAR - baseMaxFAR
    const buildableSF = lotArea * scenarioMaxFAR
    const totalUnits = Math.floor((buildableSF * EFFICIENCY_RATIO) / AVG_UNIT_SIZE_SF)
    const affordableUnits = Math.floor(totalUnits * option.affordabilityPct)

    return {
      name: `TOC ${optionName}`,
      maxFAR: scenarioMaxFAR,
      mihBonusFAR: bonusFAR,
      maxBuildableSF: buildableSF,
      affordabilityReq: `${option.affordabilityPct * 100}% of units at ${option.amiLevel}`,
      estimatedUnits: totalUnits,
      marketRateUnits: totalUnits - affordableUnits,
      affordableUnits,
      interpretation: '', // filled by Gemini
      isAIEstimate,
    }
  })
}
