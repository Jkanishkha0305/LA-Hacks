import { defineRegistry } from "@json-render/react"
import { shadcnComponents } from "@json-render/shadcn"
import { catalog } from "./catalog"

const RISK_COLORS = {
  low: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  medium: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  high: "bg-red-500/20 text-red-400 border-red-500/30",
} as const

const CONSTRAINT_STYLES = {
  FLOOD: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "E-DESIG": "bg-amber-500/20 text-amber-400 border-amber-500/30",
  LANDMARK: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  HISTORIC: "bg-orange-500/20 text-orange-400 border-orange-500/30",
} as const

const SCORE_COLORS = {
  high: "text-emerald-400",
  med: "text-amber-400",
  low: "text-red-400",
} as const

export const { registry } = defineRegistry(catalog, {
  components: {
    ...shadcnComponents,

    // Override shadcn Card — default uses py-6 px-6 gap-6 which is too large for 320px sidebar
    Card: ({ props, children }) => (
      <div className="rounded-lg border border-border bg-card text-card-foreground py-3 px-3">
        {(props.title || props.description) && (
          <div className="mb-2">
            {props.title && (
              <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">
                {props.title}
              </h3>
            )}
            {props.description && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {props.description}
              </p>
            )}
          </div>
        )}
        <div className="space-y-1.5">{children}</div>
      </div>
    ),

    // Override shadcn Stack — tighter gaps for narrow container
    Stack: ({ props, children }) => {
      const gapMap = { sm: "gap-1.5", md: "gap-2", lg: "gap-3" } as const
      const gap = gapMap[(props.gap as keyof typeof gapMap) ?? "md"]
      const dir = props.direction === "horizontal" ? "flex-row flex-wrap" : "flex-col"
      return <div className={`flex ${dir} ${gap}`}>{children}</div>
    },

    MetricCard: ({ props }) => (
      <div className="rounded-md border border-border bg-card/50 px-3 py-2">
        <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
          {props.label}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-bold font-mono text-foreground">
            {props.value}
          </span>
          {props.unit && (
            <span className="text-[10px] font-mono text-muted-foreground">
              {props.unit}
            </span>
          )}
          {props.trend && props.trend !== "neutral" && (
            <span
              className={`text-xs ${
                props.trend === "up" ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {props.trend === "up" ? "↑" : "↓"}
            </span>
          )}
        </div>
      </div>
    ),

    RiskBadge: ({ props }) => (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-mono uppercase ${RISK_COLORS[props.level]}`}
      >
        <span className="size-1.5 rounded-full bg-current" />
        {props.label ?? props.level}
      </span>
    ),

    ConstraintBadge: ({ props }) => (
      <span
        className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-mono uppercase ${CONSTRAINT_STYLES[props.type]}`}
      >
        {props.type}
      </span>
    ),

    DataRow: ({ props }) => (
      <div className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
        <span className="text-[11px] text-muted-foreground shrink-0 mr-2">{props.label}</span>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-mono font-medium text-foreground truncate">
            {props.value}
          </span>
          {props.source && (
            <span className="shrink-0 rounded bg-muted/50 px-1.5 py-px text-[8px] font-mono text-muted-foreground">
              {props.source}
            </span>
          )}
        </div>
      </div>
    ),

    ScoreIndicator: ({ props }) => (
      <div className="flex items-center gap-2 py-0.5">
        <span className={`text-base ${SCORE_COLORS[props.score]}`}>●</span>
        {props.label && (
          <span className="text-xs font-mono font-medium text-foreground">
            {props.label}
          </span>
        )}
      </div>
    ),
  },
})
