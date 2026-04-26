/**
 * verify_claim — Cross-tool consistency verifier.
 *
 * This is the keystone tool: an agent can hand us a structured claim it has
 * generated ("APN 5145-016-014 is zoned R3"), and we re-fetch the relevant
 * upstream data through OUR tools, run a typed comparison, and return a
 * verdict + evidence chain. This is "better verification for AI-generated
 * code" applied to AI-generated _answers_ — directly hitting Cognition's
 * brief.
 *
 * Verdicts:
 *   verified     — independent fetch matches the claim within tolerance
 *   contradicted — fetch returns a different value
 *   unverifiable — claim type doesn't map to a checkable upstream record
 *
 * Why it matters:
 *   - Hallucinated numeric facts are the #1 LLM failure mode for analyst work.
 *   - The verifier is itself cached, so an agent can verify-then-claim cheaply.
 *   - Contradicted verdicts include a `diff` so the agent can self-correct.
 */
import { z } from "zod"
import type { ProvenanceCache } from "../cache.js"
import type { SessionJournal } from "../journal.js"
import { runTool, type ToolDefinition } from "../runtime.js"
import { parcelTool, type ParcelOutput } from "./parcel.js"
import { permitsTool, type PermitsOutput } from "./permits.js"
import { tocTierTool, type TocTierOutput } from "./toc-tier.js"
import { geocodeTool, type GeocodeOutput } from "./geocode.js"

/**
 * The claim schema is a discriminated union over claim types. Each variant
 * specifies the subject (lat/lng, address, or APN) and the expected value.
 */
const claimSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("zoning"),
    subject: z.object({ lat: z.number(), lng: z.number() }),
    expected: z.string().describe("Expected zoning code, e.g. 'R3-1'"),
  }),
  z.object({
    type: z.literal("toc_tier"),
    subject: z.object({ lat: z.number(), lng: z.number() }),
    expected: z.number().int().min(0).max(4).describe("Expected TOC tier 0-4"),
  }),
  z.object({
    type: z.literal("lot_area_sqft"),
    subject: z.object({ lat: z.number(), lng: z.number() }),
    expected: z.number().positive(),
    tolerancePct: z.number().min(0).max(0.5).default(0.05).describe("Allowed % deviation, default 5%"),
  }),
  z.object({
    type: z.literal("apn"),
    subject: z.object({ lat: z.number(), lng: z.number() }),
    expected: z.string().describe("Expected APN, e.g. '5145-016-014'"),
  }),
  z.object({
    type: z.literal("permit_count_min"),
    subject: z.object({ lat: z.number(), lng: z.number(), radiusMeters: z.number().int().positive().max(2000).default(100) }),
    expected: z.number().int().min(0).describe("Claim that at least N permits exist within radius"),
  }),
  z.object({
    type: z.literal("address_resolves"),
    subject: z.object({ address: z.string() }),
    expected: z.object({ lat: z.number(), lng: z.number(), tolerancePct: z.number().min(0).max(0.01).default(0.001) }),
  }),
])

const inputSchema = z.object({
  claim: claimSchema,
})

export type Verdict = "verified" | "contradicted" | "unverifiable"

export interface VerificationResult {
  verdict: Verdict
  confidence: number
  reasoning: string
  evidence: Array<{
    tool: string
    input: unknown
    output: unknown
    sources: Array<{ id: string; url: string; label: string }>
    request_hash: string
    cache_hit: boolean
  }>
  diff?: { expected: unknown; actual: unknown; metric?: string }
}

function pushEvidence<T>(
  evidence: VerificationResult["evidence"],
  toolName: string,
  input: unknown,
  result: { ok: boolean; data?: unknown; error?: string; provenance: { sources: Array<{ id: string; url: string; label: string }>; request_hash: string; cache_hit: boolean } },
): void {
  evidence.push({
    tool: toolName,
    input,
    output: result.ok ? result.data : { error: result.error },
    sources: result.provenance.sources,
    request_hash: result.provenance.request_hash,
    cache_hit: result.provenance.cache_hit,
  })
  void (null as T | null)
}

export function makeVerifyClaimTool(cache: ProvenanceCache, journal: SessionJournal): ToolDefinition<z.infer<typeof inputSchema>, VerificationResult> {
  return {
    name: "verify_claim",
    version: "1.0.0",
    title: "Verify a structured claim",
    description:
      "Cross-check a structured claim by re-fetching upstream data through independent tools. Returns verified/contradicted/unverifiable + evidence chain. Critical for catching agent hallucinations on numeric facts (lot area, APN, zoning, TOC tier, permit counts).",
    inputSchema,
    cacheTtlMs: 1000 * 60 * 60, // 1h — verifications should be relatively fresh
    baseConfidence: 0.95,
    execute: async ({ claim }) => {
      const evidence: VerificationResult["evidence"] = []
      const opts = { cache, journal }

      switch (claim.type) {
        case "zoning":
        case "lot_area_sqft":
        case "apn": {
          const parcelRes = await runTool(parcelTool, claim.subject, opts)
          pushEvidence<ParcelOutput>(evidence, parcelTool.name, claim.subject, parcelRes)
          if (!parcelRes.ok) {
            return {
              verdict: "unverifiable" as const,
              confidence: 0,
              reasoning: `Could not fetch parcel for ${claim.subject.lat},${claim.subject.lng}: ${parcelRes.error}`,
              evidence,
            }
          }

          if (claim.type === "zoning") {
            const actual = parcelRes.data.zoning ?? "(unknown)"
            const expected = claim.expected.trim().toUpperCase()
            const ok = actual.toUpperCase().startsWith(expected) || actual.toUpperCase() === expected
            return {
              verdict: ok ? ("verified" as const) : ("contradicted" as const),
              confidence: ok ? 0.95 : 0.9,
              reasoning: ok
                ? `Parcel zoning "${actual}" matches claim "${claim.expected}".`
                : `Parcel zoning is "${actual}", not "${claim.expected}".`,
              evidence,
              diff: ok ? undefined : { expected: claim.expected, actual, metric: "zoning_code" },
            }
          }

          if (claim.type === "lot_area_sqft") {
            const actual = parcelRes.data.lotAreaSqft
            const tolerance = claim.tolerancePct ?? 0.05
            const delta = Math.abs(actual - claim.expected) / Math.max(claim.expected, 1)
            const ok = delta <= tolerance
            return {
              verdict: ok ? ("verified" as const) : ("contradicted" as const),
              confidence: ok ? 0.95 : 0.9,
              reasoning: ok
                ? `Lot area ${actual.toFixed(0)} sqft within ${(tolerance * 100).toFixed(1)}% of claim ${claim.expected.toFixed(0)} sqft (Δ=${(delta * 100).toFixed(1)}%).`
                : `Lot area ${actual.toFixed(0)} sqft differs from claim ${claim.expected.toFixed(0)} by ${(delta * 100).toFixed(1)}% (tolerance ${(tolerance * 100).toFixed(1)}%).`,
              evidence,
              diff: ok ? undefined : { expected: claim.expected, actual, metric: "lot_area_sqft" },
            }
          }

          // APN
          const actual = parcelRes.data.apn
          const norm = (s: string) => s.replace(/[\s-]/g, "").toUpperCase()
          const ok = norm(actual) === norm(claim.expected)
          return {
            verdict: ok ? ("verified" as const) : ("contradicted" as const),
            confidence: ok ? 0.99 : 0.9,
            reasoning: ok
              ? `APN ${actual} matches claim ${claim.expected}.`
              : `APN ${actual} differs from claim ${claim.expected}.`,
            evidence,
            diff: ok ? undefined : { expected: claim.expected, actual, metric: "apn" },
          }
        }

        case "toc_tier": {
          const tocRes = await runTool(tocTierTool, claim.subject, opts)
          pushEvidence<TocTierOutput>(evidence, tocTierTool.name, claim.subject, tocRes)
          if (!tocRes.ok) {
            return {
              verdict: "unverifiable" as const,
              confidence: 0,
              reasoning: `Could not fetch TOC tier: ${tocRes.error}`,
              evidence,
            }
          }
          const actual = tocRes.data.tier
          const ok = actual === claim.expected
          return {
            verdict: ok ? ("verified" as const) : ("contradicted" as const),
            confidence: ok ? 0.95 : 0.9,
            reasoning: ok
              ? `TOC Tier ${actual} matches claim.`
              : `TOC Tier is ${actual}, not ${claim.expected}.`,
            evidence,
            diff: ok ? undefined : { expected: claim.expected, actual, metric: "toc_tier" },
          }
        }

        case "permit_count_min": {
          const permitRes = await runTool(permitsTool, claim.subject, opts)
          pushEvidence<PermitsOutput>(evidence, permitsTool.name, claim.subject, permitRes)
          if (!permitRes.ok) {
            return {
              verdict: "unverifiable" as const,
              confidence: 0,
              reasoning: `Could not fetch permits: ${permitRes.error}`,
              evidence,
            }
          }
          const actual = permitRes.data.totalPermits
          const ok = actual >= claim.expected
          return {
            verdict: ok ? ("verified" as const) : ("contradicted" as const),
            confidence: ok ? 0.9 : 0.85,
            reasoning: ok
              ? `Found ${actual} permits within ${claim.subject.radiusMeters ?? 100}m, claim was ≥${claim.expected}.`
              : `Found only ${actual} permits within ${claim.subject.radiusMeters ?? 100}m, claim was ≥${claim.expected}.`,
            evidence,
            diff: ok ? undefined : { expected: claim.expected, actual, metric: "permit_count" },
          }
        }

        case "address_resolves": {
          const geoRes = await runTool(geocodeTool, { address: claim.subject.address }, opts)
          pushEvidence<GeocodeOutput>(evidence, geocodeTool.name, claim.subject, geoRes)
          if (!geoRes.ok) {
            return {
              verdict: "contradicted" as const,
              confidence: 0.95,
              reasoning: `Address did not resolve: ${geoRes.error}`,
              evidence,
              diff: { expected: claim.expected, actual: null, metric: "geocode" },
            }
          }
          const tol = claim.expected.tolerancePct ?? 0.001
          const dLat = Math.abs(geoRes.data.lat - claim.expected.lat)
          const dLng = Math.abs(geoRes.data.lng - claim.expected.lng)
          const ok = dLat <= Math.abs(claim.expected.lat) * tol && dLng <= Math.abs(claim.expected.lng) * tol
          return {
            verdict: ok ? ("verified" as const) : ("contradicted" as const),
            confidence: ok ? 0.95 : 0.9,
            reasoning: ok
              ? `Address resolved to (${geoRes.data.lat}, ${geoRes.data.lng}) within tolerance.`
              : `Address resolved to (${geoRes.data.lat}, ${geoRes.data.lng}), claim was (${claim.expected.lat}, ${claim.expected.lng}).`,
            evidence,
            diff: ok ? undefined : { expected: claim.expected, actual: { lat: geoRes.data.lat, lng: geoRes.data.lng }, metric: "geocode" },
          }
        }

        default: {
          const _exhaustive: never = claim
          void _exhaustive
          return {
            verdict: "unverifiable" as const,
            confidence: 0,
            reasoning: "Unknown claim type.",
            evidence,
          }
        }
      }
    },
  }
}
