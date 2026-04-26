'use client'

import { useCallback, useRef } from 'react'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@workspace/ui/components/resizable'
import type { ImperativePanelHandle } from '@workspace/ui/components/resizable'
import { LAMap } from './la-map'
import { ChatOverlay } from './chat-overlay'
import { AddressSearch } from './address-search'
import { ComparisonTable } from './comparison-table'
import { SummaryBar } from './summary-bar'
import { ParcelReport } from './parcel-report'
import { ParcelComparison } from './parcel-comparison'
import { useParcelState } from '@/lib/parcel-context'

export function Dashboard() {
  const { viewMode } = useParcelState()
  const rightPanelRef = useRef<ImperativePanelHandle>(null)

  const handleDoubleClick = useCallback(() => {
    const panel = rightPanelRef.current
    if (!panel) return
    if (panel.isCollapsed()) {
      panel.expand()
    } else {
      panel.collapse()
    }
  }, [])

  return (
    <ResizablePanelGroup
      direction="horizontal"
      autoSaveId="la-dashboard-panel-group"
      className="flex-1"
      id="la-dashboard-panel-group"
    >
      {/* Map Panel — grows to fill available space */}
      <ResizablePanel defaultSize={42} minSize={25} order={1}>
        <div className="relative h-full w-full">
          <LAMap />
          <ChatOverlay />
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle onDoubleClick={handleDoubleClick} />

      {/* Right Panel — table / report / comparison */}
      <ResizablePanel
        ref={rightPanelRef}
        defaultSize={58}
        minSize={20}
        maxSize={58}
        collapsible
        collapsedSize={0}
        order={2}
      >
        <div className="@container flex h-full min-w-0 flex-col border-l border-border">
          <div className="border-b border-border px-4 py-3">
            <AddressSearch />
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            {viewMode === 'report' && <ParcelReport />}
            {viewMode === 'compare' && <ParcelComparison />}
            {viewMode === 'table' && <ComparisonTable />}
          </div>
          {viewMode === 'table' && <SummaryBar />}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
