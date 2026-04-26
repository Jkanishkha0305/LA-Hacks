'use client'

import { useMemo, useCallback, useRef, useEffect } from 'react'
import { X, ArrowUp, ArrowDown, MapPin, GitCompareArrows, Loader2 } from 'lucide-react'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@workspace/ui/components/table'
import { Button } from '@workspace/ui/components/button'
import { useParcelState, useParcelDispatch } from '@/lib/parcel-context'
import { useVisionState, useVisionDispatch } from '@/lib/vision-context'
import { formatSF, formatFAR, formatFARDelta } from '@/lib/format'
import { fetchAgentData } from '@/lib/api/agent-client'
import { ConstraintTag, getConstraints } from './constraint-tag'
import { AgentStatus } from './agent-status'
import type { PinnedParcel, SortableColumn } from '@/lib/types'

const SCORE_COLORS = {
  high: 'text-score-high',
  med: 'text-score-med',
  low: 'text-score-low',
} as const

type ColumnDef = {
  key: SortableColumn | null
  label: string
  /** Tailwind width class — percentages for fluid layout */
  width: string
  /** Hide at narrow container widths via @container query */
  hideClass?: string
}

const VISION_COLUMNS: SortableColumn[] = ['shadowScore', 'coverageBuiltPct', 'neighborhoodScore', 'envelopeUtilization']

const COLUMNS: ColumnDef[] = [
  { key: null, label: '', width: 'w-[5%] min-w-[32px]' },
  { key: 'address', label: 'Address', width: 'w-[28%] min-w-[120px]' },
  { key: 'zoningDistrict', label: 'Zoning', width: 'w-[10%] min-w-[60px]' },
  { key: 'lotArea', label: 'Lot Area', width: 'w-[12%] min-w-[70px]', hideClass: 'hidden @xl:table-cell' },
  { key: 'farUpside', label: 'Built FAR', width: 'w-[16%] min-w-[90px]' },
  { key: 'maxBuildableSF', label: 'Max Buildable', width: 'w-[13%] min-w-[80px]', hideClass: 'hidden @lg:table-cell' },
  { key: null, label: 'Constraints', width: 'w-[12%] min-w-[80px]', hideClass: 'hidden @2xl:table-cell' },
  { key: null, label: '', width: 'w-[4%] min-w-[32px]' },
]

export function ComparisonTable() {
  const { parcels, hoveredBBL, sortColumn, sortDirection, compareBBLs } = useParcelState()
  const dispatch = useParcelDispatch()
  const { visionByBBL } = useVisionState()

  const visionDispatch = useVisionDispatch()
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>())
  const hoverSourceRef = useRef<'table' | null>(null)

  useEffect(() => {
    if (hoveredBBL && hoverSourceRef.current !== 'table') {
      rowRefs.current.get(hoveredBBL)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [hoveredBBL])

  const sortedParcels = useMemo(() => {
    const notReady = parcels.filter(p => p.status !== 'ready')
    const ready = parcels.filter(p => p.status === 'ready')

    if (!sortColumn) return [...notReady, ...ready]

    const sorted = [...ready].sort((a, b) => {
      const d = a.data!
      const e = b.data!
      let cmp = 0

      if (sortColumn === 'address') {
        cmp = a.address.localeCompare(b.address)
      } else if ((VISION_COLUMNS as readonly string[]).includes(sortColumn)) {
        const va = getVisionSortValue(a.bbl, sortColumn) ?? -1
        const vb = getVisionSortValue(b.bbl, sortColumn) ?? -1
        cmp = va - vb
      } else {
        const parcelCol = sortColumn as keyof typeof d
        const va = d[parcelCol] as number
        const vb = e[parcelCol] as number
        cmp = va - vb
      }

      return sortDirection === 'asc' ? cmp : -cmp
    })

    return [...notReady, ...sorted]
  }, [parcels, sortColumn, sortDirection, visionByBBL])

  function getVisionSortValue(bbl: string, col: SortableColumn): number | null {
    const v = visionByBBL[bbl]?.data
    if (!v) return null
    switch (col) {
      case 'shadowScore': return v.shadowScore
      case 'coverageBuiltPct': return v.coverageBreakdown?.builtPct ?? null
      case 'neighborhoodScore': return v.neighborhoodScore
      case 'envelopeUtilization': return v.envelopeUtilization
      default: return null
    }
  }

  const handleRetry = useCallback(
    async (parcel: PinnedParcel) => {
      dispatch({ type: 'UPDATE_PROGRESS', bbl: parcel.bbl, progress: 'Analyzing parcel...' })
      try {
        const data = await fetchAgentData({
          bbl: parcel.bbl,
          lat: parcel.lat,
          lng: parcel.lng,
          address: parcel.address,
        })
        dispatch({ type: 'PARCEL_READY', bbl: parcel.bbl, data })
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        dispatch({ type: 'PARCEL_ERROR', bbl: parcel.bbl, error: (err as Error).message })
      }
    },
    [dispatch],
  )

  const handleRowClick = useCallback(
    (parcel: PinnedParcel) => {
      if (parcel.status === 'ready' && parcel.data) {
        dispatch({ type: 'SELECT_PARCEL', bbl: parcel.bbl })
      }
    },
    [dispatch],
  )

  if (parcels.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <MapPin className="h-10 w-10 opacity-20" />
        <p className="text-sm font-medium">Add an address above to get started</p>
        <p className="text-xs opacity-60">Pin LA addresses to compare development potential</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            {COLUMNS.map((col, i) => (
              <TableHead key={i} className={`${col.width} ${col.hideClass ?? ''}`}>
                {col.key ? (
                  <button
                    className="flex items-center gap-1 hover:text-foreground transition-colors"
                    onClick={() => dispatch({ type: 'SET_SORT', column: col.key! })}
                  >
                    {col.label}
                    {sortColumn === col.key && (
                      sortDirection === 'asc'
                        ? <ArrowUp className="h-3 w-3" />
                        : <ArrowDown className="h-3 w-3" />
                    )}
                  </button>
                ) : (
                  col.label
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedParcels.map(parcel => {
            const isCompareSelected = compareBBLs.includes(parcel.bbl)
            const isReady = parcel.status === 'ready'

            return (
              <TableRow
                key={parcel.bbl}
                ref={(el) => { if (el) rowRefs.current.set(parcel.bbl, el); else rowRefs.current.delete(parcel.bbl) }}
                className={`transition-colors duration-150 ${hoveredBBL === parcel.bbl ? 'bg-white/5' : ''} ${isReady ? 'cursor-pointer' : ''}`}
                onMouseEnter={() => { hoverSourceRef.current = 'table'; dispatch({ type: 'SET_HOVERED', bbl: parcel.bbl }) }}
                onMouseLeave={() => { hoverSourceRef.current = null; dispatch({ type: 'SET_HOVERED', bbl: null }) }}
                onClick={() => handleRowClick(parcel)}
              >
                {/* Checkbox for compare selection */}
                <TableCell onClick={e => e.stopPropagation()}>
                  {isReady && (
                    <input
                      type="checkbox"
                      checked={isCompareSelected}
                      onChange={() => dispatch({ type: 'TOGGLE_COMPARE', bbl: parcel.bbl })}
                      className="h-3.5 w-3.5 rounded border-white/20 bg-transparent accent-primary cursor-pointer"
                    />
                  )}
                </TableCell>

                {/* Address — always shown */}
                <TableCell>
                  <div className="font-semibold text-foreground text-sm truncate">{parcel.address}</div>
                  <div className="text-muted-foreground text-xs truncate">{parcel.borough}</div>
                </TableCell>

                {parcel.status !== 'ready' ? (
                  <>
                    <TableCell colSpan={10}>
                      <AgentStatus
                        status={parcel.status}
                        progress={parcel.agentProgress}
                        error={parcel.error}
                        onRetry={() => handleRetry(parcel)}
                      />
                    </TableCell>
                  </>
                ) : (
                  <>
                    {/* Zoning */}
                    <TableCell className="font-mono text-xs truncate">{parcel.data!.zoningDistrict}</TableCell>

                    {/* Lot Area — hidden at narrow widths */}
                    <TableCell className="hidden @xl:table-cell font-mono text-xs truncate">{formatSF(parcel.data!.lotArea)}</TableCell>

                    {/* Built FAR → Max FAR (+delta) */}
                    <TableCell className="font-mono text-xs">
                      <div className="truncate">
                        <span>{formatFAR(parcel.data!.builtFAR)}</span>
                        <span className="text-muted-foreground"> → </span>
                        <span>{formatFAR(parcel.data!.maxFAR)}</span>
                        {parcel.data!.farUpside > 0 && (
                          <span className={`ml-1 ${SCORE_COLORS[parcel.data!.score]}`}>
                            ({formatFARDelta(parcel.data!.farUpside)})
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* Max Buildable — hidden at narrow widths */}
                    <TableCell className="hidden @lg:table-cell font-mono text-xs truncate">{formatSF(parcel.data!.maxBuildableSF)}</TableCell>

                    {/* Constraints — hidden at narrow widths */}
                    <TableCell className="hidden @2xl:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {getConstraints(parcel.data!).map(c => (
                          <ConstraintTag key={c} type={c} />
                        ))}
                      </div>
                    </TableCell>

                    {/* Vision Scores */}
                    {(() => {
                      const vision = visionByBBL[parcel.bbl]
                      const vd = vision?.data
                      const loading = vision?.status === 'loading'

                      if (loading) {
                        return (
                          <>
                            {[0,1,2,3].map(i => (
                              <TableCell key={i} className="w-[70px]">
                                <div className="h-3 w-8 animate-pulse rounded bg-white/5" />
                              </TableCell>
                            ))}
                          </>
                        )
                      }

                      return (
                        <>
                          <TableCell className="w-[70px] font-mono text-xs text-center border-l border-blue-500/10">
                            {vd?.shadowScore != null ? (
                              <span className={scoreColor(vd.shadowScore, 'high-good')}>{vd.shadowScore}</span>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="w-[70px] font-mono text-xs text-center">
                            {vd?.coverageBreakdown != null ? (
                              <span className={scoreColor(vd.coverageBreakdown.builtPct, 'low-good')}>{vd.coverageBreakdown.builtPct}%</span>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="w-[70px] font-mono text-xs text-center">
                            {vd?.neighborhoodScore != null ? (
                              <span className={scoreColor(vd.neighborhoodScore, 'high-good')}>{vd.neighborhoodScore}</span>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="w-[70px] font-mono text-xs text-center">
                            {vd?.envelopeUtilization != null ? (
                              <span className={scoreColor(vd.envelopeUtilization, 'low-good')}>{vd.envelopeUtilization}%</span>
                            ) : '—'}
                          </TableCell>
                        </>
                      )
                    })()}
                  </>
                )}

                {/* Actions */}
                <TableCell onClick={e => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => { dispatch({ type: 'REMOVE_PARCEL', bbl: parcel.bbl }); visionDispatch({ type: 'VISION_CLEAR', bbl: parcel.bbl }) }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {/* Compare floating bar */}
      {compareBBLs.length >= 1 && (
        <div className="sticky bottom-0 border-t border-border bg-background/95 backdrop-blur p-3 flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {compareBBLs.length} {compareBBLs.length === 1 ? 'parcel' : 'parcels'} selected
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'CLEAR_COMPARE' })}>
              Clear
            </Button>
            {compareBBLs.length >= 2 && (
              <Button size="sm" onClick={() => dispatch({ type: 'START_COMPARE' })} className="gap-1.5">
                <GitCompareArrows className="h-3.5 w-3.5" />
                Compare ({compareBBLs.length})
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function scoreColor(value: number, mode: 'high-good' | 'low-good'): string {
  if (mode === 'high-good') {
    if (value >= 7) return 'text-green-400'
    if (value >= 4) return 'text-yellow-400'
    return 'text-red-400'
  }
  // low-good: lower values are better (e.g., coverage %, envelope utilization %)
  if (value <= 30) return 'text-green-400'
  if (value <= 60) return 'text-yellow-400'
  return 'text-red-400'
}
