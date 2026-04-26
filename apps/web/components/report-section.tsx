import type { ReactNode } from 'react'

interface ReportSectionProps {
  number: string
  title: string
  subtitle?: string
  children: ReactNode
}

export function ReportSection({ number, title, subtitle, children }: ReportSectionProps) {
  return (
    <div className="bg-card rounded-xl border border-white/5 p-5 mb-4">
      <div className="flex items-baseline gap-2 mb-4">
        <span className="text-[11px] font-mono font-semibold text-primary">{number}</span>
        <h3 className="text-[15px] font-bold tracking-tight">{title}</h3>
      </div>
      {subtitle && (
        <p className="text-xs text-muted-foreground -mt-2 mb-4 pl-6">{subtitle}</p>
      )}
      {children}
    </div>
  )
}
