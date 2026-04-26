import type { PinnedParcel } from '@/lib/types'
import { formatFAR, formatSF } from '@/lib/format'

interface MapTooltipProps {
  parcel: PinnedParcel | null
  x: number
  y: number
}

export function MapTooltip({ parcel, x, y }: MapTooltipProps) {
  if (!parcel) return null

  // Flip to left side if near right edge
  const flipX = typeof window !== 'undefined' && x > window.innerWidth - 220
  const left = flipX ? x - 220 : x + 12
  const top = y - 12

  return (
    <div
      className="bg-sb-card border-white/10 pointer-events-none absolute rounded-lg border px-3 py-2 font-mono text-xs shadow-xl"
      style={{ left, top }}
    >
      <div className="text-foreground font-semibold">{parcel.address}</div>

      {parcel.status === 'loading' && (
        <div className="text-muted-foreground mt-1">
          {parcel.agentProgress ?? 'Analyzing...'}
        </div>
      )}

      {parcel.status === 'error' && (
        <div className="mt-1 text-red-400">{parcel.error}</div>
      )}

      {parcel.status === 'ready' && parcel.data && (
        <div className="text-muted-foreground mt-1 space-y-0.5">
          <div>Zoning: {parcel.data.zoningDistrict}</div>
          <div>
            FAR: {formatFAR(parcel.data.builtFAR)} / {formatFAR(parcel.data.maxFAR)}
          </div>
          <div>Lot: {formatSF(parcel.data.lotArea)}</div>
          {parcel.data.isFireHazard && <div className="text-score-low">Fire Hazard</div>}
          {parcel.data.isFaultHazard && <div className="text-score-low">Fault Zone</div>}
          {parcel.data.landmark && <div className="text-score-med">Landmark</div>}
          {parcel.data.histDist && <div className="text-score-med">Historic District</div>}
        </div>
      )}
    </div>
  )
}
