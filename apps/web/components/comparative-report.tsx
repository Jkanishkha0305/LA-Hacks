'use client'

import { X } from 'lucide-react'
import { Button } from '@workspace/ui/components/button'
import type { ComparativeReport, PinnedParcel } from '@/lib/types'

const RANK_COLORS = ['text-green-400', 'text-yellow-400', 'text-red-400', 'text-red-400', 'text-red-400']
const RANK_BG = ['bg-green-400/10', 'bg-yellow-400/10', 'bg-red-400/10', 'bg-red-400/10', 'bg-red-400/10']

export function ComparativeReportModal({
  report,
  parcels,
  onClose,
}: {
  report: ComparativeReport
  parcels: PinnedParcel[]
  onClose: () => void
}) {
  const addressByBBL = Object.fromEntries(parcels.map(p => [p.bbl, p.address]))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative mx-4 max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg border border-border bg-background p-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="font-mono text-lg font-bold">AI Development Comparison</h2>
            <p className="font-mono text-xs text-muted-foreground">
              Gemini analyzed {report.rankings.length} parcels across {report.deltas.length} dimensions
            </p>
          </div>
          <Button variant="ghost" size="icon-xs" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Rankings */}
        <section className="mb-6">
          <h3 className="mb-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Development Rankings
          </h3>
          <div className="space-y-2">
            {report.rankings
              .sort((a, b) => a.rank - b.rank)
              .map((r) => (
                <div
                  key={r.bbl}
                  className={`flex items-start gap-3 rounded-lg p-3 ${RANK_BG[r.rank - 1] || 'bg-white/5'}`}
                >
                  <span className={`font-mono text-lg font-bold ${RANK_COLORS[r.rank - 1] || 'text-muted-foreground'}`}>
                    #{r.rank}
                  </span>
                  <div className="flex-1">
                    <div className="font-mono text-sm font-semibold">{addressByBBL[r.bbl] || r.bbl}</div>
                    <div className="mt-0.5 font-mono text-xs text-muted-foreground">{r.rationale}</div>
                  </div>
                </div>
              ))}
          </div>
        </section>

        {/* Delta Analysis */}
        {report.deltas.length > 0 && (
          <section className="mb-6">
            <h3 className="mb-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Key Deltas
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {report.deltas.map((d, i) => (
                <div key={i} className="rounded-lg bg-white/[0.03] p-3">
                  <div className="font-mono text-[10px] uppercase text-muted-foreground">{d.metric}</div>
                  <div className="mt-1 font-mono text-xs">
                    <span className="text-foreground">{shortAddress(addressByBBL[d.bblA] || d.bblA)}</span>
                    <span className="text-muted-foreground"> {d.valueA} </span>
                    <span className="text-muted-foreground">vs</span>
                    <span className="text-muted-foreground"> {d.valueB} </span>
                    <span className="text-foreground">{shortAddress(addressByBBL[d.bblB] || d.bblB)}</span>
                  </div>
                  <div className="mt-1 font-mono text-xs text-green-400">{d.insight}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Composite Aerial */}
        {report.compositeAerial && (
          <section className="mb-6">
            <h3 className="mb-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              AI-Annotated Composite Aerial
            </h3>
            <img
              src={`data:image/png;base64,${report.compositeAerial}`}
              alt="Composite aerial comparison"
              className="w-full rounded-lg"
            />
          </section>
        )}

        {/* Best For */}
        <section className="mb-6">
          <h3 className="mb-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Best For
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <BestForCard
              label="Ground-Up Dev"
              bbl={report.bestFor.groundUp.bbl}
              reason={report.bestFor.groundUp.reason}
              address={addressByBBL[report.bestFor.groundUp.bbl]}
              color="green"
            />
            <BestForCard
              label="Value Play"
              bbl={report.bestFor.value.bbl}
              reason={report.bestFor.value.reason}
              address={addressByBBL[report.bestFor.value.bbl]}
              color="yellow"
            />
            <BestForCard
              label="Rehab / Convert"
              bbl={report.bestFor.rehab.bbl}
              reason={report.bestFor.rehab.reason}
              address={addressByBBL[report.bestFor.rehab.bbl]}
              color="blue"
            />
          </div>
        </section>

        {/* Comparative Notes */}
        {report.comparativeNotes && (
          <section>
            <h3 className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Analysis Summary
            </h3>
            <p className="font-mono text-xs text-foreground leading-relaxed">{report.comparativeNotes}</p>
          </section>
        )}
      </div>
    </div>
  )
}

function BestForCard({
  label,
  address,
  reason,
  color,
}: {
  label: string
  bbl: string
  address?: string
  reason: string
  color: 'green' | 'yellow' | 'blue'
}) {
  const colorMap = {
    green: { border: 'border-green-400/20', bg: 'bg-green-400/5', text: 'text-green-400' },
    yellow: { border: 'border-yellow-400/20', bg: 'bg-yellow-400/5', text: 'text-yellow-400' },
    blue: { border: 'border-blue-400/20', bg: 'bg-blue-400/5', text: 'text-blue-400' },
  }
  const c = colorMap[color]

  return (
    <div className={`rounded-lg border ${c.border} ${c.bg} p-3 text-center`}>
      <div className={`font-mono text-xs font-semibold ${c.text}`}>{label}</div>
      <div className="mt-1 font-mono text-sm font-semibold">{shortAddress(address || '?')}</div>
      <div className="mt-1 font-mono text-[10px] text-muted-foreground">{reason}</div>
    </div>
  )
}

function shortAddress(addr: string): string {
  // "350 S Grand Ave, Los Angeles, CA 90071" → "350 S Grand Ave"
  return addr.split(',')[0] || addr
}
