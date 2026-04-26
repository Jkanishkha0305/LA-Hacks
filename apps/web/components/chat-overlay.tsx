'use client'

import { useState, useEffect } from 'react'
import { MessageSquare, X, Minus } from 'lucide-react'
import { Button } from '@workspace/ui/components/button'
import { ChatPanel } from '@/components/chat-panel'
import { useParcelState, useParcelDispatch } from '@/lib/parcel-context'
import { fetchAgentData } from '@/lib/api/agent-client'

type Mode = 'closed' | 'minimized' | 'open'

export function ChatOverlay() {
  const [mode, setMode] = useState<Mode>('closed')
  const { parcels } = useParcelState()
  const dispatch = useParcelDispatch()

  // Toggle with C key
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'c' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
        setMode(prev => prev === 'open' ? 'minimized' : 'open')
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  return (
    <>
      {/* Floating trigger — closed state */}
      {mode === 'closed' && (
        <button
          onClick={() => setMode('open')}
          className="absolute bottom-4 right-4 z-20 flex items-center gap-2.5 rounded-full bg-primary px-5 py-3 text-primary-foreground shadow-lg transition-all hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
          style={{ animation: 'slideUp 400ms cubic-bezier(0.16, 1, 0.3, 1) both 0.3s' }}
        >
          <MessageSquare className="size-4" />
          <span className="text-sm font-semibold font-mono">Ask Analyst</span>
          <kbd className="ml-1 text-[10px] font-mono opacity-50 bg-primary-foreground/10 px-1.5 py-0.5 rounded">C</kbd>
        </button>
      )}

      {/* Minimized bar — keeps chat alive, click to expand */}
      {mode === 'minimized' && (
        <button
          onClick={() => setMode('open')}
          className="absolute bottom-4 right-4 z-20 flex items-center gap-2 rounded-lg border border-border bg-background/95 backdrop-blur-sm px-4 py-2.5 shadow-lg transition-all hover:shadow-xl"
          style={{ animation: 'fadeIn 150ms ease-out' }}
        >
          <MessageSquare className="size-3.5 text-muted-foreground" />
          <span className="font-mono text-xs font-semibold">AI Analyst</span>
          <kbd className="ml-1.5 text-[10px] font-mono opacity-40 px-1 py-0.5">C</kbd>
        </button>
      )}

      {/* Chat panel — always mounted for persistent state */}
      <div
        className={`absolute bottom-4 right-4 z-20 flex w-[380px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl ${
          mode === 'open'
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 translate-y-2 pointer-events-none invisible'
        }`}
        style={{
          height: 'min(500px, calc(100% - 80px))',
          transition: 'opacity 200ms ease-out, transform 200ms ease-out, visibility 200ms ease-out',
        }}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-2">
            <MessageSquare className="size-3.5 text-muted-foreground" />
            <span className="font-mono text-xs font-semibold">AI Analyst</span>
          </div>
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon-xs" onClick={() => setMode('minimized')} title="Minimize">
              <Minus className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon-xs" onClick={() => setMode('closed')} title="Close">
              <X className="size-3.5" />
            </Button>
          </div>
        </div>
        <ChatPanel
          onGeocode={({ bbl, lat, lng, label, borough }) => {
            if (!parcels.some((p) => p.bbl === bbl)) {
              dispatch({
                type: 'PIN_PARCEL',
                parcel: {
                  bbl,
                  address: label,
                  borough,
                  lat,
                  lng,
                  status: 'loading',
                },
              })
            }
            dispatch({ type: 'UPDATE_PROGRESS', bbl, progress: 'Fetching LA parcel data...' })
            fetchAgentData({ bbl, lat, lng, address: label })
              .then((data) => dispatch({ type: 'PARCEL_READY', bbl, data }))
              .catch((err) => {
                const message = err instanceof Error ? err.message : 'Parcel analysis failed'
                dispatch({ type: 'PARCEL_ERROR', bbl, error: message })
              })
          }}
        />
      </div>
    </>
  )
}
