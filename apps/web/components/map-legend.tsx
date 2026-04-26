'use client'

import { useLayerState } from '@/lib/layer-context'

// ── Legend definitions per layer ──

interface LegendItem {
  color: [number, number, number]
  opacity: number
  label: string
}

const ZONING_LEGEND: LegendItem[] = [
  { color: [245, 158, 11], opacity: 0.6, label: 'R — Residential' },
  { color: [239, 68, 68], opacity: 0.6, label: 'C — Commercial' },
  { color: [168, 85, 247], opacity: 0.6, label: 'M — Manufacturing' },
  { color: [34, 197, 94], opacity: 0.6, label: 'P — Park' },
  { color: [180, 180, 180], opacity: 0.6, label: 'Other' },
]

const FIRE_HAZARD_LEGEND: LegendItem[] = [
  { color: [239, 68, 68], opacity: 0.6, label: 'Very High Fire Hazard' },
  { color: [251, 146, 60], opacity: 0.6, label: 'High Fire Hazard' },
  { color: [252, 211, 77], opacity: 0.6, label: 'Moderate Fire Hazard' },
]

const FAULT_ZONE_LEGEND: LegendItem[] = [
  { color: [168, 85, 247], opacity: 0.6, label: 'Alquist-Priolo Fault Zone' },
]

const TOC_TIER_LEGEND: LegendItem[] = [
  { color: [34, 197, 94], opacity: 0.6, label: 'TOC Tier 4 (50% bonus)' },
  { color: [74, 222, 128], opacity: 0.6, label: 'TOC Tier 3 (35% bonus)' },
  { color: [134, 239, 172], opacity: 0.6, label: 'TOC Tier 2 (20% bonus)' },
  { color: [187, 247, 208], opacity: 0.6, label: 'TOC Tier 1 (10% bonus)' },
]

interface LegendSection {
  title: string
  items: LegendItem[]
}

export function MapLegend() {
  const { layers } = useLayerState()

  // Build sections for active layers that need a legend
  const sections: LegendSection[] = []

  if (layers['zoning-districts'].visible && layers['zoning-districts'].data) {
    sections.push({ title: 'Zoning Districts', items: ZONING_LEGEND })
  }
  if (layers['fire-hazard-zones'].visible && layers['fire-hazard-zones'].data) {
    sections.push({ title: 'Fire Hazard Zones', items: FIRE_HAZARD_LEGEND })
  }
  if (layers['earthquake-fault-zones'].visible && layers['earthquake-fault-zones'].data) {
    sections.push({ title: 'Earthquake Fault Zones', items: FAULT_ZONE_LEGEND })
  }
  if (layers['toc-tiers'].visible && layers['toc-tiers'].data) {
    sections.push({ title: 'TOC Transit Tiers', items: TOC_TIER_LEGEND })
  }

  if (sections.length === 0) return null

  return (
    <div className="absolute bottom-4 left-4 z-10 max-w-48 rounded-lg border border-white/10 bg-card/90 px-3 py-2.5 font-mono text-xs shadow-xl backdrop-blur-sm">
      {sections.map((section, i) => (
        <div key={section.title} className={i > 0 ? 'mt-2.5 border-t border-white/5 pt-2.5' : ''}>
          <p className="mb-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
            {section.title}
          </p>
          <div className="space-y-1">
            {section.items.map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-sm"
                  style={{
                    backgroundColor: `rgba(${item.color[0]}, ${item.color[1]}, ${item.color[2]}, ${item.opacity})`,
                  }}
                />
                <span className="text-muted-foreground">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
