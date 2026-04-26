'use client'

import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react'

// ── Layer IDs ──

export type LayerId = 
  | 'parcel-boundaries' 
  | 'zoning-districts' 
  | 'building-footprints'
  | 'fire-hazard-zones'
  | 'earthquake-fault-zones'
  | 'toc-tiers'
  | 'crime-incidents'
  | 'liquefaction-zones'

// ── Layer metadata (static config) ──

export interface LayerConfig {
  id: LayerId
  name: string
  group: string
  color: [number, number, number] // swatch color for the panel
}

export interface LayerGroup {
  name: string
  layers: LayerConfig[]
}

export const LAYER_CONFIGS: LayerConfig[] = [
  { id: 'parcel-boundaries', name: 'Boundaries', group: 'Parcel', color: [255, 255, 255] },
  { id: 'zoning-districts', name: 'Zoning Districts', group: 'Zoning & Land Use', color: [245, 158, 11] },
  { id: 'building-footprints', name: 'Building Footprints', group: 'Zoning & Land Use', color: [96, 165, 250] },
  { id: 'crime-incidents', name: 'Crime Incidents (1yr)', group: 'Risk Analysis', color: [255, 100, 100] },
  { id: 'fire-hazard-zones', name: 'Fire Hazard Zones', group: 'Risk Analysis', color: [239, 68, 68] },
  { id: 'earthquake-fault-zones', name: 'Earthquake Fault Zones', group: 'Risk Analysis', color: [168, 85, 247] },
  { id: 'liquefaction-zones', name: 'Liquefaction Zones', group: 'Risk Analysis', color: [59, 130, 246] },
  { id: 'toc-tiers', name: 'TOC Transit Tiers', group: 'Transit & Development', color: [34, 197, 94] },
]

export const LAYER_GROUPS: LayerGroup[] = [
  { name: 'Parcel', layers: LAYER_CONFIGS.filter(l => l.group === 'Parcel') },
  { name: 'Zoning & Land Use', layers: LAYER_CONFIGS.filter(l => l.group === 'Zoning & Land Use') },
  { name: 'Risk Analysis', layers: LAYER_CONFIGS.filter(l => l.group === 'Risk Analysis') },
  { name: 'Transit & Development', layers: LAYER_CONFIGS.filter(l => l.group === 'Transit & Development') },
]

// ── Per-layer state ──

export interface LayerState {
  visible: boolean
  loading: boolean
  error: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: GeoJSON.FeatureCollection | null
}

export interface LayersState {
  layers: Record<LayerId, LayerState>
}

// ── Actions ──

export type LayerAction =
  | { type: 'TOGGLE_LAYER'; id: LayerId }
  | { type: 'LAYER_LOADING'; id: LayerId }
  | { type: 'LAYER_LOADED'; id: LayerId; data: GeoJSON.FeatureCollection }
  | { type: 'LAYER_ERROR'; id: LayerId; error: string }

// ── Initial state ──

function defaultLayerState(visible: boolean): LayerState {
  return { visible, loading: false, error: null, data: null }
}

const initialState: LayersState = {
  layers: {
    'parcel-boundaries': defaultLayerState(true),
    'zoning-districts': defaultLayerState(false),
    'building-footprints': defaultLayerState(false),
    'crime-incidents': defaultLayerState(false),
    'fire-hazard-zones': defaultLayerState(false),
    'earthquake-fault-zones': defaultLayerState(false),
    'toc-tiers': defaultLayerState(false),
    'liquefaction-zones': defaultLayerState(false),
  },
}

// ── Reducer ──

function layerReducer(state: LayersState, action: LayerAction): LayersState {
  switch (action.type) {
    case 'TOGGLE_LAYER':
      return {
        ...state,
        layers: {
          ...state.layers,
          [action.id]: {
            ...state.layers[action.id],
            visible: !state.layers[action.id].visible,
          },
        },
      }

    case 'LAYER_LOADING':
      return {
        ...state,
        layers: {
          ...state.layers,
          [action.id]: {
            ...state.layers[action.id],
            loading: true,
            error: null,
          },
        },
      }

    case 'LAYER_LOADED':
      return {
        ...state,
        layers: {
          ...state.layers,
          [action.id]: {
            ...state.layers[action.id],
            loading: false,
            data: action.data,
          },
        },
      }

    case 'LAYER_ERROR':
      return {
        ...state,
        layers: {
          ...state.layers,
          [action.id]: {
            ...state.layers[action.id],
            loading: false,
            error: action.error,
          },
        },
      }

    default:
      return state
  }
}

// ── Context ──

const LayerContext = createContext<LayersState>(initialState)
const LayerDispatchContext = createContext<Dispatch<LayerAction>>(() => {})

export function LayerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(layerReducer, initialState)
  return (
    <LayerContext.Provider value={state}>
      <LayerDispatchContext.Provider value={dispatch}>
        {children}
      </LayerDispatchContext.Provider>
    </LayerContext.Provider>
  )
}

export function useLayerState() {
  return useContext(LayerContext)
}

export function useLayerDispatch() {
  return useContext(LayerDispatchContext)
}
