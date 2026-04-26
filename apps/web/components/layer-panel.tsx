'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, AlertCircle } from 'lucide-react'
import {
  LAYER_GROUPS,
  useLayerState,
  useLayerDispatch,
  type LayerId,
  type LayerConfig,
} from '@/lib/layer-context'

export function LayerPanel() {
  // "Parcel" group expanded by default
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    Parcel: true,
  })

  const { layers } = useLayerState()
  const dispatch = useLayerDispatch()

  const toggleGroup = (name: string) => {
    setExpandedGroups((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  const handleToggle = (id: LayerId) => {
    dispatch({ type: 'TOGGLE_LAYER', id })
  }

  return (
    <div className="flex-1 overflow-y-auto p-3">
      <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Layers
      </p>
      <div className="space-y-1">
        {LAYER_GROUPS.map((group) => {
          const expanded = expandedGroups[group.name] ?? false
          return (
            <div key={group.name}>
              {/* Group header */}
              <button
                onClick={() => toggleGroup(group.name)}
                className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-xs font-mono text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
              >
                {expanded ? (
                  <ChevronDown className="size-3 shrink-0" />
                ) : (
                  <ChevronRight className="size-3 shrink-0" />
                )}
                <span className="truncate">{group.name}</span>
              </button>

              {/* Layer toggles */}
              {expanded && (
                <div className="ml-3 mt-0.5 space-y-0.5">
                  {group.layers.map((layer) => (
                    <LayerRow
                      key={layer.id}
                      config={layer}
                      state={layers[layer.id]}
                      onToggle={() => handleToggle(layer.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function LayerRow({
  config,
  state,
  onToggle,
}: {
  config: LayerConfig
  state: { visible: boolean; loading: boolean; error: string | null }
  onToggle: () => void
}) {
  return (
    <div className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-muted/30 transition-colors">
      {/* Color swatch */}
      <span
        className="size-2.5 shrink-0 rounded-sm"
        style={{
          backgroundColor: `rgb(${config.color[0]}, ${config.color[1]}, ${config.color[2]})`,
          opacity: state.visible ? 1 : 0.3,
        }}
      />

      {/* Layer name */}
      <span
        className={`flex-1 font-mono text-xs truncate ${
          state.visible ? 'text-foreground' : 'text-muted-foreground'
        }`}
      >
        {config.name}
      </span>

      {/* Error indicator */}
      {state.error && (
        <span title={state.error}>
          <AlertCircle className="size-3 shrink-0 text-destructive" />
        </span>
      )}

      {/* Loading spinner or toggle switch */}
      {state.loading ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <button
          onClick={onToggle}
          className={`relative shrink-0 rounded-full transition-colors ${
            state.visible ? 'bg-primary' : 'bg-muted'
          }`}
          style={{ width: 28, height: 16 }}
          aria-label={`Toggle ${config.name}`}
          aria-pressed={state.visible}
        >
          <span
            className="absolute rounded-full bg-white shadow-sm transition-transform"
            style={{
              width: 12,
              height: 12,
              top: 2,
              left: state.visible ? 14 : 2,
            }}
          />
        </button>
      )}
    </div>
  )
}
