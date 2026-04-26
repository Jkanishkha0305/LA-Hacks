import type { PinnedParcel, VisionData, VisionEntry, ComparativeReport } from "@/lib/types"
import { GeminiModel } from "@/lib/config/models"
import {
  aggregateReportArtifactSchema,
  type AggregateReportArtifact,
  type MediaArtifact,
} from "@/lib/types/report"

type ReportScope = AggregateReportArtifact["scope"]

const GENERATED_VISION_MODEL = GeminiModel.FLASH_IMAGE

type VisionLookup = Record<string, VisionEntry>

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function toDataUri(base64: string | null, mimeType: string): string | null {
  if (!base64) return null
  return `data:${mimeType};base64,${base64}`
}

function createMediaArtifact({
  id,
  title,
  mimeType,
  dataUri,
  model,
}: {
  id: string
  title: string
  mimeType: string
  dataUri: string | null
  model: string | null
}): MediaArtifact | null {
  if (!dataUri) return null

  return {
    id,
    kind: "image",
    title,
    prompt: null,
    model,
    mimeType,
    url: null,
    dataUri,
    createdAt: null,
  }
}

function buildVisionMediaArtifacts(
  bbl: string,
  vision: VisionData | null
): MediaArtifact[] {
  if (!vision) return []

  return [
    createMediaArtifact({
      id: `${bbl}-street-view`,
      title: "Street View",
      mimeType: "image/jpeg",
      dataUri: toDataUri(vision.streetViewImage, "image/jpeg"),
      model: null,
    }),
    createMediaArtifact({
      id: `${bbl}-satellite`,
      title: "Satellite",
      mimeType: "image/png",
      dataUri: toDataUri(vision.aerialImage, "image/png"),
      model: null,
    }),
    createMediaArtifact({
      id: `${bbl}-annotated-aerial`,
      title: "AI Annotated Aerial",
      mimeType: "image/png",
      dataUri: toDataUri(vision.annotatedAerial, "image/png"),
      model: GENERATED_VISION_MODEL,
    }),
    createMediaArtifact({
      id: `${bbl}-shadow-diagram`,
      title: "Shadow Diagram",
      mimeType: "image/png",
      dataUri: toDataUri(vision.shadowDiagram, "image/png"),
      model: GENERATED_VISION_MODEL,
    }),
    createMediaArtifact({
      id: `${bbl}-envelope-image`,
      title: "Envelope Visualization",
      mimeType: "image/png",
      dataUri: toDataUri(vision.envelopeImage, "image/png"),
      model: GENERATED_VISION_MODEL,
    }),
  ].filter((artifact): artifact is MediaArtifact => Boolean(artifact))
}

function getIncludedReadyParcels(
  parcels: PinnedParcel[],
  compareBBLs: string[]
): { parcels: PinnedParcel[]; scope: ReportScope } {
  const readyParcels = parcels.filter(
    (parcel) => parcel.status === "ready" && parcel.data
  )
  const comparedParcels = readyParcels.filter((parcel) =>
    compareBBLs.includes(parcel.bbl)
  )

  if (comparedParcels.length >= 2) {
    return {
      parcels: comparedParcels,
      scope: "compare-selection",
    }
  }

  return {
    parcels: readyParcels,
    scope: "all-ready",
  }
}

function getReportTitle(parcels: PinnedParcel[], scope: ReportScope): string {
  if (parcels.length === 1) {
    return `${parcels[0]!.address} Property Report`
  }

  return scope === "compare-selection"
    ? `Parcel Comparison Report (${parcels.length} Parcels)`
    : `Parcel Portfolio Report (${parcels.length} Parcels)`
}

export function hasAggregateReportParcels(parcels: PinnedParcel[]): boolean {
  return parcels.some((parcel) => parcel.status === "ready" && parcel.data)
}

export function buildAggregateReportArtifact(
  parcels: PinnedParcel[],
  compareBBLs: string[],
  visionByBBL: VisionLookup,
  comparativeReport: ComparativeReport | null = null
): AggregateReportArtifact | null {
  const { parcels: includedParcels, scope } = getIncludedReadyParcels(
    parcels,
    compareBBLs
  )

  if (includedParcels.length === 0) {
    return null
  }

  const artifact = {
    kind: "aggregate-parcel-report" as const,
    generatedAt: new Date().toISOString(),
    title: getReportTitle(includedParcels, scope),
    scope,
    summary: {
      totalParcels: includedParcels.length,
      readyParcelCount: parcels.filter(
        (parcel) => parcel.status === "ready" && parcel.data
      ).length,
      comparedParcelCount: compareBBLs.length,
      includedBBLs: includedParcels.map((parcel) => parcel.bbl),
    },
    comparativeVision: comparativeReport
      ? {
          rankings: comparativeReport.rankings,
          comparativeNotes: comparativeReport.comparativeNotes,
          bestFor: comparativeReport.bestFor,
          deltas: comparativeReport.deltas,
          compositeAerial: comparativeReport.compositeAerial,
        }
      : null,
    parcels: includedParcels.map((parcel) => {
      const vision =
        visionByBBL[parcel.bbl]?.status === "ready"
          ? (visionByBBL[parcel.bbl]!.data ?? null)
          : null

      return {
        bbl: parcel.bbl,
        address: parcel.address,
        borough: parcel.borough,
        lat: parcel.lat,
        lng: parcel.lng,
        rawParcelData: parcel.data!,
        contextualData: {
          visionAssessment: vision?.assessment ?? null,
          coverageBreakdown: vision?.coverageBreakdown ?? null,
          neighborhoodScore: vision?.neighborhoodScore ?? null,
          neighborhoodDetails: vision?.neighborhoodDetails ?? null,
          shadowScore: vision?.shadowScore ?? null,
          envelopeUtilization: vision?.envelopeUtilization ?? null,
        },
        mediaArtifacts: buildVisionMediaArtifacts(parcel.bbl, vision),
      }
    }),
  }

  return aggregateReportArtifactSchema.parse(artifact)
}

export function getAggregateReportFilename(
  parcels: PinnedParcel[],
  compareBBLs: string[]
): string {
  const { parcels: includedParcels, scope } = getIncludedReadyParcels(
    parcels,
    compareBBLs
  )

  if (includedParcels.length === 0) {
    return "parcel-report.html"
  }

  if (includedParcels.length === 1) {
    const base = slugify(includedParcels[0]!.address || includedParcels[0]!.bbl)
    return `${base || "parcel"}-report.html`
  }

  const prefix =
    scope === "compare-selection"
      ? `${includedParcels.length}-parcel-comparison`
      : `${includedParcels.length}-parcel-portfolio`

  return `${prefix}-report.html`
}
