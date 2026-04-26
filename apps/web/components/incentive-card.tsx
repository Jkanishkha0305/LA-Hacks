import type { Incentive } from '@/lib/types'

const STATUS_STYLES = {
  'Applicable': 'border-l-green-500 text-green-400',
  'Potentially Eligible': 'border-l-yellow-500 text-yellow-400',
  'Not Applicable': 'border-l-muted-foreground text-muted-foreground',
} as const

const STATUS_BADGE_STYLES = {
  'Applicable': 'bg-green-500/20 text-green-400',
  'Potentially Eligible': 'bg-yellow-500/20 text-yellow-400',
  'Not Applicable': 'bg-muted/50 text-muted-foreground',
} as const

export function IncentiveCard({ name, status, detail, impact }: Incentive) {
  return (
    <div className={`bg-muted/30 rounded-lg border-l-2 p-4 mb-2 last:mb-0 ${STATUS_STYLES[status]}`}>
      <div className="flex items-start justify-between mb-1">
        <span className="text-sm font-semibold text-foreground">{name}</span>
        <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${STATUS_BADGE_STYLES[status]}`}>
          {status}
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-1">{detail}</p>
      {impact && (
        <p className="text-xs text-primary font-mono">
          → {impact}
        </p>
      )}
    </div>
  )
}
