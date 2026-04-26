import { formatNumber, formatSF, formatFAR } from '@/lib/format'

interface DataRowProps {
  label: string
  value: string | number | null | undefined
  source?: string
  highlight?: boolean
  formatAs?: 'number' | 'sf' | 'far' | 'text'
}

function formatValue(value: string | number | null | undefined, formatAs?: DataRowProps['formatAs']): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'string') return value
  switch (formatAs) {
    case 'number': return formatNumber(value)
    case 'sf': return formatSF(value)
    case 'far': return formatFAR(value)
    default: return String(value)
  }
}

export function DataRow({ label, value, source, highlight, formatAs }: DataRowProps) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`text-sm font-mono ${highlight ? 'text-primary font-bold' : 'text-foreground'}`}>
          {formatValue(value, formatAs)}
        </span>
        {source && (
          <span className="text-[10px] font-mono bg-muted/50 text-muted-foreground px-1.5 py-0.5 rounded">
            {source}
          </span>
        )}
      </div>
    </div>
  )
}
