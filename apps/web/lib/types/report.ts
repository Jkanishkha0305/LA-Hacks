import { z } from "zod"
import { propertyEvaluationSchema } from "@/lib/types/property"

export const mediaArtifactSchema = z.object({
  id: z.string(),
  kind: z.enum(["image"]),
  title: z.string().nullable(),
  prompt: z.string().nullable(),
  model: z.string().nullable(),
  mimeType: z.string().nullable(),
  url: z.string().nullable(),
  dataUri: z.string().nullable(),
  createdAt: z.string().datetime().nullable(),
})

export const analysisRawDataSchema = z.object({
  geocodeAddress: z.unknown().optional(),
  fetchParcelData: z.unknown().optional(),
  fetchViolations: z.unknown().optional(),
  fetchPermits: z.unknown().optional(),
  fetchComplaints: z.unknown().optional(),
  fetchSalesComps: z.unknown().optional(),
  fetchRentData: z.unknown().optional(),
  fetchCrimeData: z.unknown().optional(),
  fetchCensusData: z.unknown().optional(),
})

export const analysisArtifactSchema = z.object({
  userPrompt: z.string().min(1),
  generatedAt: z.string().datetime(),
  narrative: z.string().min(1),
  structuredAnalysis: propertyEvaluationSchema,
  rawData: analysisRawDataSchema,
  mediaArtifacts: z.array(mediaArtifactSchema).default([]),
})

export const aggregateReportParcelSchema = z.object({
  bbl: z.string().min(1),
  address: z.string().min(1),
  borough: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  rawParcelData: z.record(z.string(), z.unknown()),
  contextualData: z.record(z.string(), z.unknown()).default({}),
  mediaArtifacts: z.array(mediaArtifactSchema).default([]),
})

export const comparativeRankingSchema = z.object({
  bbl: z.string(),
  rank: z.number(),
  rationale: z.string(),
})

export const comparativeDeltaSchema = z.object({
  metric: z.string(),
  bblA: z.string(),
  valueA: z.string(),
  bblB: z.string(),
  valueB: z.string(),
  insight: z.string(),
})

export const comparativeVisionSchema = z.object({
  rankings: z.array(comparativeRankingSchema),
  comparativeNotes: z.string(),
  bestFor: z.object({
    groundUp: z.object({ bbl: z.string(), reason: z.string() }),
    value: z.object({ bbl: z.string(), reason: z.string() }),
    rehab: z.object({ bbl: z.string(), reason: z.string() }),
  }),
  deltas: z.array(comparativeDeltaSchema),
  compositeAerial: z.string().nullable(),
})

export const aggregateReportArtifactSchema = z.object({
  kind: z.literal("aggregate-parcel-report"),
  generatedAt: z.string().datetime(),
  title: z.string().min(1),
  scope: z.enum(["compare-selection", "all-ready"]),
  summary: z.object({
    totalParcels: z.number().int().positive(),
    readyParcelCount: z.number().int().positive(),
    comparedParcelCount: z.number().int().nonnegative(),
    includedBBLs: z.array(z.string().min(1)).min(1),
  }),
  parcels: z.array(aggregateReportParcelSchema).min(1),
  comparativeVision: comparativeVisionSchema.nullable().default(null),
})

export const reportArtifactSchema = z.union([
  analysisArtifactSchema,
  aggregateReportArtifactSchema,
])

export const reportRequestSchema = z.object({
  artifact: reportArtifactSchema,
  filename: z.string().min(1).max(120),
})

export type MediaArtifact = z.infer<typeof mediaArtifactSchema>
export type AnalysisArtifact = z.infer<typeof analysisArtifactSchema>
export type AggregateReportParcel = z.infer<typeof aggregateReportParcelSchema>
export type AggregateReportArtifact = z.infer<
  typeof aggregateReportArtifactSchema
>
export type ReportArtifact = z.infer<typeof reportArtifactSchema>
