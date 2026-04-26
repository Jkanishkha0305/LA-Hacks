'use client'

import { useState, useMemo } from 'react'
import { ArrowLeft, FileDown, Loader2 } from 'lucide-react'
import { Button } from '@workspace/ui/components/button'
import { useParcelState, useParcelDispatch } from '@/lib/parcel-context'
import { formatNumber, formatSF, formatFAR, formatFARDelta } from '@/lib/format'
import { useReportGeneration } from '@/hooks/use-report-generation'
import { buildArtifactFromComparison, getComparisonReportFilename } from '@/lib/parcel-to-artifact'
import type { PinnedParcel, ParcelData } from '@/lib/types'

interface CompareRow {
  label: string
  section: string
  getValue: (data: ParcelData) => string
  higherIsBetter?: boolean
  getNumeric?: (data: ParcelData) => number
}

const COMPARE_ROWS: CompareRow[] = [
  // Zoning
  { section: 'ZONING', label: 'District', getValue: d => d.zoningDistrict },
  { section: 'ZONING', label: 'Commercial Overlay', getValue: d => d.commercialOverlay || '—' },
  { section: 'ZONING', label: 'Max FAR', getValue: d => formatFAR(d.maxFAR), higherIsBetter: true, getNumeric: d => d.maxFAR },
  { section: 'ZONING', label: 'Max Buildable SF', getValue: d => formatSF(d.maxBuildableSF), higherIsBetter: true, getNumeric: d => d.maxBuildableSF },
  { section: 'ZONING', label: 'TOC Status', getValue: d => d.tocTier || 'N/A' },

  // Development
  { section: 'DEVELOPMENT', label: 'Lot Area', getValue: d => formatSF(d.lotArea), higherIsBetter: true, getNumeric: d => d.lotArea },
  { section: 'DEVELOPMENT', label: 'Built FAR', getValue: d => formatFAR(d.builtFAR), getNumeric: d => d.builtFAR },
  { section: 'DEVELOPMENT', label: 'FAR Upside', getValue: d => formatFARDelta(d.farUpside), higherIsBetter: true, getNumeric: d => d.farUpside },
  { section: 'DEVELOPMENT', label: 'Lot Frontage', getValue: d => `${formatNumber(d.lotFrontage)} ft`, higherIsBetter: true, getNumeric: d => d.lotFrontage },
  { section: 'DEVELOPMENT', label: 'Lot Depth', getValue: d => `${formatNumber(d.lotDepth)} ft`, higherIsBetter: true, getNumeric: d => d.lotDepth },

  // Constraints
  { section: 'CONSTRAINTS', label: 'Fire Hazard', getValue: d => d.isFireHazard ? `⚠ ${d.fireHazardZone}` : '✓ None' },
  { section: 'CONSTRAINTS', label: 'Fault Zone', getValue: d => d.isFaultHazard ? `⚠ ${d.faultZone}` : '✓ None' },
  { section: 'CONSTRAINTS', label: 'E-Designation', getValue: d => d.eDesigNum ? `⚠ ${d.eDesigNum}` : '✓ None' },
  { section: 'CONSTRAINTS', label: 'Landmark', getValue: d => d.landmark ? `⚠ ${d.landmark}` : '✓ None' },
  { section: 'CONSTRAINTS', label: 'Historic District', getValue: d => d.histDist ? `⚠ ${d.histDist}` : '✓ None' },

  // Existing Conditions
  { section: 'EXISTING', label: 'Building Class', getValue: d => d.buildingClass || '—' },
  { section: 'EXISTING', label: 'Year Built', getValue: d => d.yearBuilt ? String(d.yearBuilt) : '—' },
  { section: 'EXISTING', label: 'Floors', getValue: d => String(d.numFloors), getNumeric: d => d.numFloors },
  { section: 'EXISTING', label: 'Residential Units', getValue: d => formatNumber(d.unitsRes), getNumeric: d => d.unitsRes },
  { section: 'EXISTING', label: 'Building Area', getValue: d => formatSF(d.buildingArea), getNumeric: d => d.buildingArea },
  { section: 'EXISTING', label: 'Owner', getValue: d => d.ownerName || '—' },
]

const SCORE_STYLES = {
  high: 'text-score-high bg-score-high/10',
  med: 'text-score-med bg-score-med/10',
  low: 'text-score-low bg-score-low/10',
} as const

export function ParcelComparison() {
  const { compareBBLs, parcels } = useParcelState()
  const dispatch = useParcelDispatch()
  const [showDiffsOnly, setShowDiffsOnly] = useState(false)
  const report = useReportGeneration()

  const compareParcels = useMemo(
    () => compareBBLs
      .map(bbl => parcels.find(p => p.bbl === bbl))
      .filter((p): p is PinnedParcel => !!p && p.status === 'ready' && !!p.data),
    [compareBBLs, parcels],
  )

  if (compareParcels.length < 2) {
    dispatch({ type: 'CLEAR_COMPARE' })
    return null
  }

  const handleBack = () => dispatch({ type: 'CLEAR_COMPARE' })

  // Filter rows to only show differences if toggle is on
  const filteredRows = showDiffsOnly
    ? COMPARE_ROWS.filter(row => {
        const values = compareParcels.map(p => row.getValue(p.data!))
        return new Set(values).size > 1
      })
    : COMPARE_ROWS

  // Group rows by section
  const sections = Array.from(new Set(filteredRows.map(r => r.section)))

  // Find best value for numeric rows
  function getBestBBL(row: CompareRow): string | null {
    if (!row.getNumeric || !row.higherIsBetter) return null
    let bestVal = -Infinity
    let bestBBL: string | null = null
    for (const p of compareParcels) {
      const val = row.getNumeric(p.data!)
      if (val > bestVal) {
        bestVal = val
        bestBBL = p.bbl
      }
    }
    return bestBBL
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
          <Button variant="ghost" size="sm" onClick={handleBack} className="gap-1 -ml-2 text-muted-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={showDiffsOnly}
                onChange={e => setShowDiffsOnly(e.target.checked)}
                className="h-3.5 w-3.5 rounded accent-primary"
              />
              Diffs only
            </label>
            <span className="text-xs text-muted-foreground font-mono">
              {compareParcels.length} parcels
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={report.isGenerating}
              onClick={() => {
                const artifact = buildArtifactFromComparison(compareParcels)
                if (artifact) report.generate(artifact, getComparisonReportFilename(compareParcels))
              }}
              className="gap-1.5"
            >
              {report.isGenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileDown className="h-3.5 w-3.5" />
              )}
              {report.isGenerating
                ? `Generating... (${report.elapsedSeconds}s)`
                : 'Export Comparison'}
            </Button>
          </div>
        </div>

        {report.error && (
          <div className="text-[10px] text-destructive mb-3">
            {report.error}
            <button onClick={report.clearError} className="ml-2 underline">Dismiss</button>
          </div>
        )}

        {/* Comparison Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            {/* Sticky header with parcel names */}
            <thead className="sticky top-0 z-10 bg-background">
              <tr>
                <th className="text-left text-xs text-muted-foreground font-normal p-2 w-[140px] border-b border-white/10" />
                {compareParcels.map(p => (
                  <th
                    key={p.bbl}
                    className="text-left p-2 border-b border-white/10 min-w-[160px]"
                    onMouseEnter={() => dispatch({ type: 'SET_HOVERED', bbl: p.bbl })}
                    onMouseLeave={() => dispatch({ type: 'SET_HOVERED', bbl: null })}
                  >
                    <div className="font-semibold text-sm truncate">{p.address}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{p.borough} · {p.bbl}</div>
                  </th>
                ))}
              </tr>
              {/* Score row */}
              <tr>
                <td className="p-2 text-xs text-muted-foreground border-b border-white/10">Score</td>
                {compareParcels.map(p => (
                  <td key={p.bbl} className="p-2 border-b border-white/10">
                    <span className={`inline-block text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded ${SCORE_STYLES[p.data!.score]}`}>
                      {p.data!.score}
                    </span>
                  </td>
                ))}
              </tr>
            </thead>

            <tbody>
              {sections.map(section => {
                const sectionRows = filteredRows.filter(r => r.section === section)
                if (sectionRows.length === 0) return null

                return (
                  <SectionGroup key={section} section={section}>
                    {sectionRows.map((row, i) => {
                      const bestBBL = getBestBBL(row)
                      return (
                        <tr key={row.label} className={i % 2 === 0 ? '' : 'bg-white/[0.02]'}>
                          <td className="text-xs text-muted-foreground p-2 border-b border-white/5">{row.label}</td>
                          {compareParcels.map(p => {
                            const val = row.getValue(p.data!)
                            const isBest = bestBBL === p.bbl && bestBBL !== null
                            return (
                              <td
                                key={p.bbl}
                                className={`text-sm font-mono p-2 border-b border-white/5 ${isBest ? 'text-primary font-semibold' : 'text-foreground'}`}
                                onMouseEnter={() => dispatch({ type: 'SET_HOVERED', bbl: p.bbl })}
                                onMouseLeave={() => dispatch({ type: 'SET_HOVERED', bbl: null })}
                              >
                                {val}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </SectionGroup>
                )
              })}

              {/* AI Analysis section */}
              <SectionGroup section="AI ANALYSIS">
                <tr>
                  <td className="text-xs text-muted-foreground p-2 align-top border-b border-white/5">Interpretation</td>
                  {compareParcels.map(p => (
                    <td key={p.bbl} className="text-xs text-foreground p-2 leading-relaxed border-b border-white/5">
                      {p.data!.interpretation}
                    </td>
                  ))}
                </tr>
              </SectionGroup>
            </tbody>
          </table>
        </div>

        {/* Disclaimer */}
        <div className="text-[10px] text-muted-foreground/60 mt-6 leading-relaxed">
          Sources: LA County Assessor, LA GeoHub, ZIMAS. AI Analysis by Gemini — verify with zoning counsel.
        </div>
      </div>
    </div>
  )
}

function SectionGroup({ section, children }: { section: string; children: React.ReactNode }) {
  return (
    <>
      <tr>
        <td
          colSpan={10}
          className="text-[10px] font-mono font-semibold text-primary uppercase tracking-wider p-2 pt-4 border-b border-white/10"
        >
          {section}
        </td>
      </tr>
      {children}
    </>
  )
}
