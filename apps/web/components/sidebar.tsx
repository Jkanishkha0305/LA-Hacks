"use client"

import { useState, useEffect } from "react"
import { Button } from "@workspace/ui/components/button"
import { Layers, Eye, ChevronLeft, ChevronRight } from "lucide-react"
import { VisionPanel } from "@/components/vision-panel"
import { LayerPanel } from "@/components/layer-panel"
import { ApiKeyDialog } from "@/components/api-key-dialog"
import { useParcelState } from "@/lib/parcel-context"
import { useVisionState, useVisionDispatch } from "@/lib/vision-context"
import { fetchVisionData } from "@/lib/api/vision-client"

type Tab = "layers" | "vision"

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [tab, setTab] = useState<Tab>("layers")
  const { parcels, selectedBBL } = useParcelState()
  const { visionByBBL } = useVisionState()
  const visionDispatch = useVisionDispatch()

  // Auto-trigger vision analysis when Analysis tab is active and a parcel is selected
  useEffect(() => {
    if (tab !== 'vision') return
    // Find the target parcel: selected, or most recently pinned
    const targetBBL = selectedBBL ?? parcels[parcels.length - 1]?.bbl ?? null
    if (!targetBBL) return
    const parcel = parcels.find(p => p.bbl === targetBBL)
    if (!parcel || parcel.status !== 'ready') return
    // Skip if already fetching or fetched
    const entry = visionByBBL[targetBBL]
    if (entry && entry.status !== 'idle') return

    visionDispatch({ type: 'VISION_START', bbl: targetBBL })
    fetchVisionData({
      bbl: targetBBL,
      lat: parcel.lat,
      lng: parcel.lng,
      address: parcel.address,
    })
      .then(data => visionDispatch({ type: 'VISION_READY', bbl: targetBBL, data }))
      .catch(err => visionDispatch({ type: 'VISION_ERROR', bbl: targetBBL, error: String(err) }))
  }, [tab, selectedBBL, parcels]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <aside
      className={`flex flex-col border-r border-border bg-card transition-[width] duration-200 ${
        collapsed ? "w-12" : "w-80"
      }`}
    >
      <div className="flex h-14 items-center justify-between border-b border-border px-3">
        {!collapsed && (
          <h1 className="font-mono text-sm font-bold tracking-tight uppercase">
            LA <span className="text-muted-foreground">Decision Engine</span>
          </h1>
        )}
        <div className="flex items-center gap-1">
          {!collapsed && <ApiKeyDialog />}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <ChevronRight className="size-3.5" />
            ) : (
              <ChevronLeft className="size-3.5" />
            )}
          </Button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Tab Navigation */}
          <div className="flex border-b border-border">
            <TabButton
              active={tab === "layers"}
              onClick={() => setTab("layers")}
              icon={<Layers className="size-3.5" />}
              label="Layers"
            />
            <TabButton
              active={tab === "vision"}
              onClick={() => setTab("vision")}
              icon={<Eye className="size-3.5" />}
              label="Analysis"
            />
          </div>

          <div className={tab === "layers" ? "flex flex-col flex-1 min-h-0" : "hidden"}>
            <LayerPanel />
          </div>
          <div className={tab === "vision" ? "flex flex-col flex-1 min-h-0" : "hidden"}>
            <VisionPanel />
          </div>
        </>
      )}
    </aside>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-mono transition-colors ${
        active
          ? "text-foreground border-b-2 border-primary"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
