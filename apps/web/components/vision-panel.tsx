'use client'

import { useParcelState } from '@/lib/parcel-context'
import { useVisionState } from '@/lib/vision-context'

const SV_HEADINGS = ['North', 'East', 'South', 'West'] as const

export function VisionPanel() {
  const { parcels, hoveredBBL } = useParcelState()
  const { visionByBBL } = useVisionState()

  // Show hovered parcel's vision data, or fall back to most recently pinned
  const targetBBL = hoveredBBL ?? parcels[parcels.length - 1]?.bbl ?? null
  const parcel = parcels.find(p => p.bbl === targetBBL)
  const entry = targetBBL ? visionByBBL[targetBBL] : undefined

  if (!targetBBL || !parcel) {
    return (
      <div className="flex h-full items-center justify-center p-4 font-mono text-xs text-muted-foreground">
        Pin an address to see visual analysis
      </div>
    )
  }

  if (!entry || entry.status === 'idle') {
    return (
      <div className="flex h-full items-center justify-center p-4 font-mono text-xs text-muted-foreground">
        No vision data available
      </div>
    )
  }

  if (entry.status === 'loading') {
    return (
      <div className="space-y-4 p-4">
        <p className="font-mono text-xs text-muted-foreground">{parcel.address}</p>
        <div className="aspect-video animate-pulse rounded bg-white/5" />
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-white/5" />
          ))}
        </div>
        <div className="aspect-square animate-pulse rounded bg-white/5" />
      </div>
    )
  }

  if (entry.status === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 font-mono text-xs text-muted-foreground">
        <p>Vision analysis failed</p>
        <p className="text-red-400">{entry.error}</p>
      </div>
    )
  }

  const { data } = entry
  if (!data) return null

  return (
    <div className="space-y-4 overflow-y-auto p-4">
      <p className="font-mono text-xs font-medium text-foreground">{parcel.address}</p>

      {/* ── RAW IMAGES ── */}
      <SectionLabel>Raw Images</SectionLabel>

      {/* Street View (front) */}
      {data.streetViewImage ? (
        <div className="space-y-1">
          <SubLabel>Street View</SubLabel>
          <img
            src={`data:image/jpeg;base64,${data.streetViewImage}`}
            alt={`Street view of ${parcel.address}`}
            className="w-full rounded"
          />
        </div>
      ) : (
        <div className="flex aspect-video items-center justify-center rounded bg-white/5 font-mono text-xs text-muted-foreground">
          No Street View coverage
        </div>
      )}

      {/* Street View 360° (N/E/S/W) */}
      {data.streetViewMulti && data.streetViewMulti.length > 0 && (
        <div className="space-y-1">
          <SubLabel>Street View 360°</SubLabel>
          <div className="grid grid-cols-2 gap-1">
            {data.streetViewMulti.map((img, i) => (
              <div key={i} className="relative">
                <img
                  src={`data:image/jpeg;base64,${img}`}
                  alt={`${SV_HEADINGS[i]} view of ${parcel.address}`}
                  className="w-full rounded"
                />
                <span className="absolute top-1 left-1 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[9px] text-white">
                  {SV_HEADINGS[i]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raw Satellite */}
      {data.aerialImage && (
        <div className="space-y-1">
          <SubLabel>Satellite</SubLabel>
          <img
            src={`data:image/jpeg;base64,${data.aerialImage}`}
            alt={`Satellite view of ${parcel.address}`}
            className="w-full rounded"
          />
        </div>
      )}

      {/* ── AI ANALYSIS ── */}
      <SectionLabel>AI Analysis</SectionLabel>

      {/* Site Assessment */}
      {data.assessment && (
        <div className="space-y-2">
          <SubLabel>Site Assessment</SubLabel>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs">
            <AssessmentRow label="Stories" value={data.assessment.estimatedStories?.toString() ?? '—'} />
            <AssessmentRow label="Use" value={data.assessment.currentUse} />
            <AssessmentRow label="Condition" value={data.assessment.condition} />
            <AssessmentRow label="Type" value={data.assessment.buildingType} />
            <AssessmentRow label="Construction" value={data.assessment.constructionActivity ? 'Yes' : 'No'} />
          </div>
          {data.assessment.lotFeatures.length > 0 && (
            <div className="font-mono text-xs">
              <span className="text-muted-foreground">Features: </span>
              <span className="text-foreground">{data.assessment.lotFeatures.join(', ')}</span>
            </div>
          )}
          {data.assessment.adjacentContext && (
            <div className="font-mono text-xs">
              <span className="text-muted-foreground">Adjacent: </span>
              <span className="text-foreground">{data.assessment.adjacentContext}</span>
            </div>
          )}
          {data.assessment.developmentNotes && (
            <div className="font-mono text-xs">
              <span className="text-muted-foreground">Notes: </span>
              <span className="text-foreground">{data.assessment.developmentNotes}</span>
            </div>
          )}
        </div>
      )}

      {/* Vision Scores */}
      {(data.shadowScore != null || data.neighborhoodScore != null || data.envelopeUtilization != null) && (
        <div className="space-y-2">
          <SubLabel>Vision Scores</SubLabel>
          {data.shadowScore != null && (
            <ScoreBar label="Shadow" value={data.shadowScore} max={10} suffix="/10" />
          )}
          {data.neighborhoodScore != null && (
            <ScoreBar label="Neighborhood" value={data.neighborhoodScore} max={10} suffix="/10" />
          )}
          {data.envelopeUtilization != null && (
            <ScoreBar label="Envelope Used" value={data.envelopeUtilization} max={100} suffix="%" inverted />
          )}
        </div>
      )}

      {/* Coverage Breakdown (all 3 segments) */}
      {data.coverageBreakdown && (
        <div className="space-y-2">
          <SubLabel>Lot Coverage</SubLabel>
          <ScoreBar label="Built" value={data.coverageBreakdown.builtPct} max={100} suffix="%" inverted />
          <ScoreBar label="Paved" value={data.coverageBreakdown.pavedPct} max={100} suffix="%" inverted />
          <ScoreBar label="Green" value={data.coverageBreakdown.greenPct} max={100} suffix="%" />
        </div>
      )}

      {/* Neighborhood Details */}
      {data.neighborhoodDetails && (
        <div className="space-y-1">
          <SubLabel>Neighborhood</SubLabel>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs">
            <AssessmentRow label="Walkability" value={`${data.neighborhoodDetails.walkability}/10`} />
            <AssessmentRow label="Commercial" value={`${data.neighborhoodDetails.commercialDensity}/10`} />
            <AssessmentRow label="Infrastructure" value={`${data.neighborhoodDetails.infrastructure}/10`} />
            <AssessmentRow label="Transit" value={`${data.neighborhoodDetails.transitAccess}/10`} />
          </div>
          {data.neighborhoodDetails.highlights.length > 0 && (
            <div className="font-mono text-xs">
              <span className="text-green-400">+</span>
              <span className="text-foreground ml-1">{data.neighborhoodDetails.highlights.join(', ')}</span>
            </div>
          )}
          {data.neighborhoodDetails.concerns.length > 0 && (
            <div className="font-mono text-xs">
              <span className="text-red-400">-</span>
              <span className="text-foreground ml-1">{data.neighborhoodDetails.concerns.join(', ')}</span>
            </div>
          )}
        </div>
      )}

      {/* ── AI-GENERATED IMAGES ── */}
      <SectionLabel>AI-Generated Images</SectionLabel>

      {/* NB2 Annotated Aerial */}
      {data.annotatedAerial && (
        <div className="space-y-1">
          <SubLabel>Annotated Aerial (NB2)</SubLabel>
          <img
            src={`data:image/png;base64,${data.annotatedAerial}`}
            alt={`AI-annotated aerial of ${parcel.address}`}
            className="w-full rounded"
          />
        </div>
      )}

      {/* Shadow Diagram */}
      {data.shadowDiagram && (
        <div className="space-y-1">
          <SubLabel>Shadow Analysis</SubLabel>
          <img
            src={`data:image/png;base64,${data.shadowDiagram}`}
            alt={`Shadow diagram of ${parcel.address}`}
            className="w-full rounded"
          />
        </div>
      )}

      {/* Envelope Visualization */}
      {data.envelopeImage && (
        <div className="space-y-1">
          <SubLabel>Buildable Envelope</SubLabel>
          <img
            src={`data:image/png;base64,${data.envelopeImage}`}
            alt={`Buildable envelope of ${parcel.address}`}
            className="w-full rounded"
          />
        </div>
      )}

      {/* No aerial fallback */}
      {!data.aerialImage && !data.annotatedAerial && (
        <div className="flex aspect-square items-center justify-center rounded bg-white/5 font-mono text-xs text-muted-foreground">
          No aerial imagery
        </div>
      )}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t border-white/10 pt-3">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-primary">{children}</p>
    </div>
  )
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{children}</p>
  )
}

function AssessmentRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </>
  )
}

function ScoreBar({ label, value, max, suffix, inverted }: {
  label: string
  value: number
  max: number
  suffix: string
  inverted?: boolean
}) {
  const pct = Math.min((value / max) * 100, 100)
  const goodness = inverted ? (max - value) / max : value / max
  const color = goodness >= 0.7 ? 'bg-green-400' : goodness >= 0.4 ? 'bg-yellow-400' : 'bg-red-400'

  return (
    <div>
      <div className="flex justify-between font-mono text-xs mb-0.5">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground">{value}{suffix}</span>
      </div>
      <div className="h-1 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
