"use client"

import { useMemo, useState, useCallback } from "react"
import { Eye, FileDown, Loader2 } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { useParcelState } from "@/lib/parcel-context"
import { useVisionState, useVisionDispatch } from "@/lib/vision-context"
import { formatSF, formatFAR } from "@/lib/format"
import { useAnimatedNumber } from "@/lib/hooks/use-animated-number"
import { getConstraints } from "./constraint-tag"
import {
  fetchComparativeReport,
  type CompareParcelInput,
} from "@/lib/api/vision-compare-client"
import { ComparativeReportModal } from "./comparative-report"
import {
  buildAggregateReportArtifact,
  getAggregateReportFilename,
  hasAggregateReportParcels,
} from "@/lib/aggregate-report-artifact"
import { downloadGeneratedReport } from "@/lib/api/report-client"

export function SummaryBar() {
  const { parcels, compareBBLs } = useParcelState()
  const { visionByBBL, comparativeStatus, comparativeReport } = useVisionState()
  const visionDispatch = useVisionDispatch()
  const [showReport, setShowReport] = useState(false)
  const [isGeneratingParcelReport, setIsGeneratingParcelReport] =
    useState(false)
  const [parcelReportError, setParcelReportError] = useState<string | null>(
    null
  )

  const readyParcels = useMemo(
    () => parcels.filter((p) => p.status === "ready" && p.data),
    [parcels]
  )

  // Parcels that have both parcel data and vision data ready
  const visionReadyParcels = useMemo(
    () =>
      readyParcels.filter(
        (p) =>
          visionByBBL[p.bbl]?.status === "ready" && visionByBBL[p.bbl]?.data
      ),
    [readyParcels, visionByBBL]
  )

  const canCompare = visionReadyParcels.length >= 2
  const canGenerateParcelReport = hasAggregateReportParcels(parcels)

  const totalBuildable = readyParcels.reduce(
    (sum, p) => sum + p.data!.maxBuildableSF,
    0
  )
  const avgFARUpside =
    readyParcels.length > 0
      ? readyParcels.reduce((sum, p) => sum + p.data!.farUpside, 0) /
        readyParcels.length
      : 0

  const animatedBuildable = useAnimatedNumber(totalBuildable)
  const animatedFARUpside = useAnimatedNumber(avgFARUpside)

  const handleCompareVision = useCallback(async () => {
    if (!canCompare) return

    visionDispatch({ type: "COMPARE_START" })

    const compareInputs: CompareParcelInput[] = visionReadyParcels.map((p) => {
      const vd = visionByBBL[p.bbl]!.data!
      return {
        bbl: p.bbl,
        address: p.address,
        streetViewImage: vd.streetViewImage || "",
        aerialImage: vd.aerialImage || "",
        shadowScore: vd.shadowScore,
        coverageBuiltPct: vd.coverageBreakdown?.builtPct ?? null,
        neighborhoodScore: vd.neighborhoodScore,
        envelopeUtilization: vd.envelopeUtilization,
        zoningDistrict: p.data?.zoningDistrict ?? null,
        lotArea: p.data?.lotArea ?? null,
        maxFAR: p.data?.maxFAR ?? null,
        farUpside: p.data?.farUpside ?? null,
        builtFAR: p.data?.builtFAR ?? null,
      }
    })

    try {
      const report = await fetchComparativeReport(compareInputs)
      visionDispatch({ type: "COMPARE_READY", report })
      setShowReport(true)
    } catch (err) {
      visionDispatch({ type: "COMPARE_ERROR", error: (err as Error).message })
    }
  }, [canCompare, visionReadyParcels, visionByBBL, visionDispatch])

  const handleGenerateParcelReport = useCallback(async () => {
    const artifact = buildAggregateReportArtifact(
      parcels,
      compareBBLs,
      visionByBBL,
      comparativeReport
    )
    if (!artifact || isGeneratingParcelReport) return

    setIsGeneratingParcelReport(true)
    setParcelReportError(null)

    try {
      await downloadGeneratedReport({
        artifact,
        filename: getAggregateReportFilename(parcels, compareBBLs),
      })
    } catch (error) {
      setParcelReportError(
        error instanceof Error ? error.message : "Failed to generate report"
      )
    } finally {
      setIsGeneratingParcelReport(false)
    }
  }, [compareBBLs, comparativeReport, isGeneratingParcelReport, parcels, visionByBBL])

  if (parcels.length === 0) return null

  const constrainedCount = readyParcels.filter(
    (p) => getConstraints(p.data!).length > 0
  ).length
  const isComparing = comparativeStatus === "loading"
  const hasActions = canGenerateParcelReport || canCompare || comparativeReport

  return (
    <>
      <div className="border-t border-white/10 bg-sb-card px-4 py-3 space-y-2.5">
        {/* Metrics row */}
        <div className="grid grid-cols-4 gap-3">
          <Metric label="Buildable" value={formatSF(Math.round(animatedBuildable))} />
          <Metric label="FAR Upside" value={formatFAR(animatedFARUpside)} />
          <Metric label="Constrained" value={`${constrainedCount} / ${readyParcels.length}`} />
          <Metric label="Analyzed" value={`${readyParcels.length} / ${parcels.length}`} />
        </div>

        {/* Actions row */}
        {hasActions && (
          <div className="flex items-center justify-end gap-2 flex-wrap">
            {comparativeReport && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowReport(true)}
                className="font-mono text-xs"
              >
                View Report
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerateParcelReport}
              disabled={!canGenerateParcelReport || isGeneratingParcelReport}
              className="gap-1.5 font-mono text-xs"
            >
              {isGeneratingParcelReport ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileDown className="h-3.5 w-3.5" />
              )}
              {isGeneratingParcelReport ? "Generating..." : "Export Report Deck"}
            </Button>
            {canCompare && (
              <Button
                size="sm"
                onClick={handleCompareVision}
                disabled={isComparing}
                className="gap-1.5 font-mono text-xs"
              >
                {isComparing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
                {isComparing
                  ? "Comparing..."
                  : `Compare Vision (${visionReadyParcels.length})`}
              </Button>
            )}
          </div>
        )}
        {parcelReportError && (
          <div className="text-[10px] text-destructive">
            {parcelReportError}
          </div>
        )}
      </div>

      {showReport && comparativeReport && (
        <ComparativeReportModal
          report={comparativeReport}
          parcels={parcels}
          onClose={() => setShowReport(false)}
        />
      )}
    </>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground uppercase">{label}</div>
      <div className="font-mono text-sm font-semibold text-foreground">
        {value}
      </div>
    </div>
  )
}
