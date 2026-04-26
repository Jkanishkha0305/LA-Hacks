# SiteBrief — Phased Implementation Plan

> Implementation plan for the SiteBrief dashboard: address search, AI agent analysis, map pins, and comparison table.
> Each phase is self-contained and can be executed independently by a separate agent, provided prior phases are complete.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ Browser                                                         │
│                                                                 │
│  ┌──────────┐  ┌──────────────────────┐  ┌────────────────────┐│
│  │ Sidebar   │  │ Map Panel (42%)      │  │ Table Panel (58%)  ││
│  │ (existing)│  │                      │  │                    ││
│  │           │  │ ┌──────────────────┐ │  │ ┌────────────────┐ ││
│  │           │  │ │ AddressSearch    │ │  │ │ ComparisonTable│ ││
│  │           │  │ │ (GeoSearch API)  │ │  │ │  - parcel rows │ ││
│  │           │  │ └──────────────────┘ │  │ │  - sort columns│ ││
│  │           │  │                      │  │ │  - hover sync  │ ││
│  │           │  │ ┌──────────────────┐ │  │ └────────────────┘ ││
│  │           │  │ │ DeckGL + MapLibre│ │  │                    ││
│  │           │  │ │  - parcel pins   │ │  │ ┌────────────────┐ ││
│  │           │  │ │  - hover tooltip │ │  │ │ SummaryBar     │ ││
│  │           │  │ └──────────────────┘ │  │ └────────────────┘ ││
│  └──────────┘  └──────────────────────┘  └────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
         │                                         │
         └────── ParcelProvider (React Context) ───┘
                          │
                    ┌─────┴─────┐
                    │ /api/agent │  (Next.js API Route)
                    └─────┬─────┘
                          │
              ┌───────────┼───────────┐
              │           │           │
         ┌────┴────┐ ┌───┴───┐ ┌────┴────┐
         │ PLUTO   │ │ FEMA  │ │ DCP GIS │
         │ Socrata │ │ NFHL  │ │ Zoning  │
         └─────────┘ └───────┘ └─────────┘
```

## Data Flow

```
User types address
       │
       ▼
[1] LA GeoSearch autocomplete (CLIENT-SIDE, no auth)
    GET https://geosearch.planninglabs.la/v2/autocomplete?text=...
    Returns: { label, name, borough, bbl, coordinates: [lng, lat] }
       │
       ▼
[2] User selects result → PIN_PARCEL dispatched
    Pin appears on map immediately (loading state)
    Table row appears with progress indicator
       │
       ▼
[3] POST /api/agent { bbl, lat, lng, address }
    Input validated via zod (BBL must be 10 digits, lat/lng in LA range)
    Phase A — Deterministic data fetching (parallel, with 5s timeouts):
       │
       ├── fetchPLUTO(bbl)         → Socrata SODA API (PLUTO parcel data)
       ├── fetchFloodZone(lat,lng) → FEMA NFHL MapServer (flood zone)
       ├── fetchZoningGIS(lat,lng) → DCP ArcGIS (zoning district)
       └── fetchMIH(lat,lng)       → DCP ArcGIS (MIH designated areas)
       │
       ▼
    Phase B — Deterministic computation:
       computeMaxFAR() → MX districts sum FAR, others use max
       computeScore()  → composite (farUpside × lotArea), penalized by constraints
       │
       ▼
    Phase C — Gemini interpretation only:
       generateObject() with zod schema → 2-4 sentence interpretation text
       │
       ▼
    Returns plain JSON response (not SSE stream) matching ParcelData type
       │
       ▼
[4] PARCEL_READY dispatched → table row populates, pin color updates
```

## API Reference

| API | Auth | Rate Limit | Timeout | Endpoint |
|-----|------|------------|---------|----------|
| LA GeoSearch | None | Informal (debounce 300ms) | — | `https://geosearch.planninglabs.la/v2/autocomplete` |
| PLUTO (Socrata) | App token (optional) | 1K/hr without, ~10K/hr with token | 10s | `https://data.cityofnewyork.us/resource/${PLUTO_RESOURCE_ID}.json` |
| FEMA NFHL | None | Informal | 5s | `https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/28/query` |
| DCP GIS Zoning | None | Informal | 5s | `https://services5.arcgis.com/.../nyzd/FeatureServer/0/query` |
| DCP MIH Areas | None | Informal | 5s | `https://services5.arcgis.com/.../LADCP_Inclusionary_Housing_Designated_Areas/FeatureServer/0/query` |
| Gemini (AI SDK) | API key | 15 RPM free tier | — | Via `@ai-sdk/google` `generateObject()` (interpretation only) |

> **Note on LA Geoclient API**: GeoSearch is used as the primary geocoder (free, no auth, returns BBL). Geoclient (`api.la.gov/geo/geoclient/v2`) returns 100+ additional fields and can be added later as an enrichment source. It requires a subscription key that may take days to approve — register at `https://api-portal.la.gov/` if desired.

## Environment Setup

Copy `.env.example` to `.env.local` and fill in your keys:

```bash
cp .env.example .env.local
```

Required keys:
- `LA_OPENDATA_TOKEN` — free, instant at `https://data.cityofnewyork.us/profile/edit/developer_settings`
- `GOOGLE_GENERATIVE_AI_API_KEY` — free at `https://aistudio.google.com/apikey`

## Future Work (Not In Scope)

- **Layer 3: Vertical Analysis Report** — clicking a table row opens a full deep-dive report. Will be developed as a separate effort after the dashboard is complete.
- **LA Geoclient enrichment** — additional parcel fields (community district, census tract, congressional district, etc.)
- **City of Yes PDF analysis** — multimodal Gemini reasoning over zoning amendment PDFs from `zr.planning.la.gov`
- **Batch address upload** — paste multiple addresses at once
- **CSV/PDF export** — export table or reports

---

## Phase 1: Foundation ✅ COMPLETE

### Goal
Install all dependencies, define types, set up state management, add design tokens, and add required shadcn components. No visible UI changes — this phase builds the infrastructure everything else depends on.

### Completion Notes
- All dependencies installed: `ai`, `@ai-sdk/google` in apps/web; `table`, `badge`, `input` shadcn components in packages/ui
- Also installed `@deck.gl/core` to fix pre-existing type error in `la-map.tsx` (missing `MapViewState` type)
- All files created as specified. `zod` deferred to Phase 3 (when API route needs it)
- `.env.example` already existed with matching content — skipped
- Fonts: kept Inter + Geist Mono (already configured) instead of SITEBRIEF's Instrument Sans + IBM Plex Mono
- Surface colors: used implementation oklch values (lighter than SITEBRIEF hex)
- Build passes (`next build` compiles, TypeScript checks pass)
- `computeMaxFAR('M1-4/R7A', 4.6, 2.0, 0)` → `6.6` ✓
- `computeScore(4.0, 25000, 0)` → `'high'` ✓

### Prerequisites
- Working `pnpm dev` with existing sidebar + map
- `.env.local` created from `.env.example` (keys can be empty for this phase)

### Dependencies to Install

```bash
# In apps/web — Vercel AI SDK + Gemini provider
pnpm add ai @ai-sdk/google --filter web

# In packages/ui — shadcn components
pnpm dlx shadcn@latest add table badge input --cwd packages/ui
```

### Files to Create

#### 1. `apps/web/.env.example`

```
# LA Open Data (Socrata SODA API) — PLUTO parcel data
# Get your free app token at: https://data.cityofnewyork.us/profile/edit/developer_settings
LA_OPENDATA_TOKEN=

# Google Gemini API — AI reasoning via Vercel AI SDK
# Get your free API key at: https://aistudio.google.com/apikey
GOOGLE_GENERATIVE_AI_API_KEY=

# LA PLUTO dataset resource ID (Socrata) — changes with each annual release
# Current default: 64uk-42ks (24v4). Override here if a newer version is published.
# Verify at: https://data.cityofnewyork.us/City-Government/Primary-Land-Use-Tax-Lot-Output-PLUTO-/64uk-42ks
# PLUTO_RESOURCE_ID=64uk-42ks

# LA Geoclient API (optional — GeoSearch is used as primary geocoder)
# Register at: https://api-portal.la.gov/ (approval may take days)
# LA_GEOCLIENT_KEY=
```

#### 2. `apps/web/lib/types.ts`

Define all shared types used across phases. These types are derived from real API response shapes.

```typescript
// ── GeoSearch API Response ──

export interface GeoSearchResult {
  label: string                    // "120 BROADWAY, Manhattan, Los Angeles, NY, USA"
  name: string                     // "120 BROADWAY"
  borough: string                  // "Manhattan"
  bbl: string                      // "1000477501" (10-digit)
  coordinates: [number, number]    // [lng, lat] — GeoJSON order
}

// ── Parcel State ──

export type ParcelStatus = 'loading' | 'ready' | 'error'

export interface PinnedParcel {
  bbl: string
  address: string
  borough: string
  lat: number
  lng: number
  status: ParcelStatus
  agentProgress?: string           // "Fetching parcel data...", etc.
  data?: ParcelData                // populated when agent completes
  error?: string
}

// ── Parcel Data (populated by agent) ──

export interface ParcelData {
  // Zoning (from PLUTO + DCP GIS)
  zoningDistrict: string           // PLUTO: zonedist1
  commercialOverlay: string | null // PLUTO: overlay1
  specialDistrict: string | null   // PLUTO: spdist1

  // MIH (from DCP GIS MIH layer)
  mihArea: string | null           // e.g. "MIH Option 1", "MIH Option 1 and 2"
  mihBonusFAR: number | null       // additional FAR unlocked by MIH compliance

  // Lot (from PLUTO)
  lotArea: number                  // PLUTO: lotarea (sq ft)
  lotFrontage: number              // PLUTO: lotfront (ft)
  lotDepth: number                 // PLUTO: lotdepth (ft)

  // FAR (from PLUTO)
  builtFAR: number                 // PLUTO: builtfar
  residFAR: number                 // PLUTO: residfar (max residential)
  commFAR: number                  // PLUTO: commfar (max commercial)
  facilFAR: number                 // PLUTO: facilfar (max facility)

  // Building (from PLUTO)
  buildingClass: string            // PLUTO: bldgclass
  yearBuilt: number                // PLUTO: yearbuilt
  numFloors: number                // PLUTO: numfloors
  unitsRes: number                 // PLUTO: unitsres
  unitsTotal: number               // PLUTO: unitstotal
  buildingArea: number             // PLUTO: bldgarea (sq ft)
  ownerName: string                // PLUTO: ownername

  // Constraints (from PLUTO + FEMA)
  landmark: string | null          // PLUTO: landmark
  histDist: string | null          // PLUTO: histdist
  eDesigNum: string | null         // PLUTO: edesignum
  floodZone: string | null         // FEMA: FLD_ZONE ("AE", "X", etc.)
  isFloodHazard: boolean           // FEMA: SFHA_TF === "T"

  // Computed (deterministic — see lib/zoning.ts)
  maxFAR: number                   // MX districts: residFAR + commFAR
                                   // R districts: residFAR
                                   // C/M districts: commFAR
                                   // See computeMaxFAR() in lib/zoning.ts
  farUpside: number                // max(0, maxFAR - builtFAR)
  maxBuildableSF: number           // lotArea * maxFAR
  score: 'high' | 'med' | 'low'   // Composite: (farUpside * lotArea), penalized by constraints

  // Agent interpretation
  interpretation: string           // Gemini-generated summary
}

// ── Constraint Tags (for UI) ──

export type ConstraintType = 'FLOOD' | 'E-DESIG' | 'LANDMARK' | 'HISTORIC'

// ── Context State ──

export interface ParcelState {
  parcels: PinnedParcel[]
  hoveredBBL: string | null
  sortColumn: SortableColumn | null
  sortDirection: 'asc' | 'desc'
}

export type SortableColumn =
  | 'address'
  | 'zoningDistrict'
  | 'lotArea'
  | 'builtFAR'
  | 'maxFAR'
  | 'farUpside'
  | 'maxBuildableSF'

export type ParcelAction =
  | { type: 'PIN_PARCEL'; parcel: Omit<PinnedParcel, 'status'>  & { status: 'loading' } }
  | { type: 'UPDATE_PROGRESS'; bbl: string; progress: string }
  | { type: 'PARCEL_READY'; bbl: string; data: ParcelData }
  | { type: 'PARCEL_ERROR'; bbl: string; error: string }
  | { type: 'REMOVE_PARCEL'; bbl: string }
  | { type: 'SET_HOVERED'; bbl: string | null }
  | { type: 'SET_SORT'; column: SortableColumn }
  | { type: 'CLEAR_ALL' }
```

#### 3. `apps/web/lib/format.ts`

Utility functions for formatting numbers in the UI.

```typescript
/**
 * Format a number with commas: 12345 → "12,345"
 */
export function formatNumber(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

/**
 * Format a number as square feet: 12345 → "12,345 SF"
 */
export function formatSF(n: number): string {
  return `${formatNumber(n)} SF`
}

/**
 * Format a FAR value: 6.5 → "6.50"
 */
export function formatFAR(n: number): string {
  return n.toFixed(2)
}

/**
 * Format a FAR delta with sign: 4.4 → "+4.40"
 */
export function formatFARDelta(n: number): string {
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}`
}
```

#### 4. `apps/web/lib/parcel-context.tsx`

React Context + `useReducer` for shared state between map and table.

```typescript
'use client'

import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react'
import type { ParcelState, ParcelAction, SortableColumn } from './types'

const initialState: ParcelState = {
  parcels: [],
  hoveredBBL: null,
  sortColumn: null,
  sortDirection: 'asc',
}

function parcelReducer(state: ParcelState, action: ParcelAction): ParcelState {
  switch (action.type) {
    case 'PIN_PARCEL':
      // Prevent duplicate pins
      if (state.parcels.some(p => p.bbl === action.parcel.bbl)) return state
      return { ...state, parcels: [...state.parcels, action.parcel] }

    case 'UPDATE_PROGRESS':
      return {
        ...state,
        parcels: state.parcels.map(p =>
          p.bbl === action.bbl ? { ...p, agentProgress: action.progress } : p
        ),
      }

    case 'PARCEL_READY':
      return {
        ...state,
        parcels: state.parcels.map(p =>
          p.bbl === action.bbl ? { ...p, status: 'ready', data: action.data, agentProgress: undefined } : p
        ),
      }

    case 'PARCEL_ERROR':
      return {
        ...state,
        parcels: state.parcels.map(p =>
          p.bbl === action.bbl ? { ...p, status: 'error', error: action.error, agentProgress: undefined } : p
        ),
      }

    case 'REMOVE_PARCEL':
      return { ...state, parcels: state.parcels.filter(p => p.bbl !== action.bbl) }

    case 'SET_HOVERED':
      return { ...state, hoveredBBL: action.bbl }

    case 'SET_SORT': {
      const isSameColumn = state.sortColumn === action.column
      return {
        ...state,
        sortColumn: action.column,
        sortDirection: isSameColumn && state.sortDirection === 'asc' ? 'desc' : 'asc',
      }
    }

    case 'CLEAR_ALL':
      return initialState

    default:
      return state
  }
}

const ParcelContext = createContext<ParcelState>(initialState)
const ParcelDispatchContext = createContext<Dispatch<ParcelAction>>(() => {})

export function ParcelProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(parcelReducer, initialState)
  return (
    <ParcelContext.Provider value={state}>
      <ParcelDispatchContext.Provider value={dispatch}>
        {children}
      </ParcelDispatchContext.Provider>
    </ParcelContext.Provider>
  )
}

export function useParcelState() {
  return useContext(ParcelContext)
}

export function useParcelDispatch() {
  return useContext(ParcelDispatchContext)
}
```

#### 5. `apps/web/lib/api/geosearch.ts`

Client-side function to call LA GeoSearch autocomplete.

```typescript
import type { GeoSearchResult } from '../types'

const GEOSEARCH_BASE = 'https://geosearch.planninglabs.la/v2'

/**
 * Search LA addresses via GeoSearch autocomplete.
 * Client-side — no auth required.
 * Debounce calls to 300ms on the consumer side.
 */
export async function searchAddress(text: string): Promise<GeoSearchResult[]> {
  if (text.trim().length < 3) return []

  const url = `${GEOSEARCH_BASE}/autocomplete?text=${encodeURIComponent(text)}`
  const res = await fetch(url)

  if (!res.ok) {
    console.error('GeoSearch error:', res.status)
    return []
  }

  const data = await res.json()

  return data.features
    .map((f: any) => ({
      label: f.properties.label,
      name: f.properties.name,
      borough: f.properties.borough,
      bbl: f.properties.addendum?.pad?.bbl ?? null,
      coordinates: f.geometry.coordinates as [number, number],
    }))
    .filter((r: GeoSearchResult) => r.bbl != null)
}
```

#### 6. `apps/web/lib/zoning.ts`

Deterministic zoning computation module. Keeps domain logic out of the AI prompt and makes it unit-testable.

```typescript
/**
 * Compute effective maxFAR based on zoning district type.
 *
 * MX districts (e.g., M1-4/R7A) allow summing commercial + residential FAR.
 * Pure residential/commercial districts use the applicable FAR only.
 *
 * This is critical for Gowanus demo parcels — the area was rezoned as MX,
 * so using max() instead of sum would significantly understate buildable SF.
 */
export function computeMaxFAR(
  zoningDistrict: string,
  residFAR: number,
  commFAR: number,
  facilFAR: number,
): number {
  const isMixedUse = /^M\d.*\/R\d/.test(zoningDistrict) // M1-4/R7A pattern
  if (isMixedUse) return residFAR + commFAR
  if (zoningDistrict.startsWith('R')) return Math.max(residFAR, facilFAR)
  if (zoningDistrict.startsWith('C') || zoningDistrict.startsWith('M'))
    return Math.max(commFAR, facilFAR)
  return Math.max(residFAR, commFAR, facilFAR) // fallback
}

/**
 * Compute development potential score.
 *
 * Composite of FAR upside × lot area, penalized by constraints.
 * Thresholds calibrated to LA development economics:
 *   - 100K+ SF adjusted potential → high
 *   - 30K–100K SF → med
 *   - <30K SF → low
 */
export function computeScore(
  farUpside: number,
  lotArea: number,
  constraintCount: number,
): 'high' | 'med' | 'low' {
  const rawScore = farUpside * lotArea
  const penalty = constraintCount * 0.15 // 15% penalty per constraint
  const adjustedScore = rawScore * (1 - penalty)

  if (adjustedScore >= 100_000) return 'high'
  if (adjustedScore >= 30_000) return 'med'
  return 'low'
}
```

### Files to Modify

#### 7. `packages/ui/src/styles/globals.css`

Add SiteBrief design tokens inside the `.dark { }` block, after the existing variables:

```css
/* SiteBrief — score colors */
--score-high: oklch(0.723 0.219 142.1);
--score-med: oklch(0.769 0.189 70.7);
--score-low: oklch(0.637 0.237 25.3);

/* SiteBrief — accent blue */
--sb-accent: oklch(0.694 0.129 256.8);

/* SiteBrief — surface hierarchy */
--sb-bg: oklch(0.128 0 0);
--sb-card: oklch(0.155 0 0);
--sb-nested: oklch(0.172 0 0);
```

Also add the corresponding light-mode values inside `:root { }`:

```css
--score-high: oklch(0.55 0.2 142.1);
--score-med: oklch(0.6 0.17 70.7);
--score-low: oklch(0.5 0.22 25.3);
--sb-accent: oklch(0.5 0.15 256.8);
--sb-bg: oklch(0.98 0 0);
--sb-card: oklch(0.96 0 0);
--sb-nested: oklch(0.94 0 0);
```

And add Tailwind mappings in `@theme inline { }`:

```css
--color-score-high: var(--score-high);
--color-score-med: var(--score-med);
--color-score-low: var(--score-low);
--color-sb-accent: var(--sb-accent);
--color-sb-bg: var(--sb-bg);
--color-sb-card: var(--sb-card);
--color-sb-nested: var(--sb-nested);
```

### Verification

1. Run `pnpm dev` — app should compile without errors
2. Run `pnpm typecheck --filter web` — no type errors
3. Verify shadcn components exist:
   - `packages/ui/src/components/table.tsx`
   - `packages/ui/src/components/badge.tsx`
   - `packages/ui/src/components/input.tsx`
4. Verify `ai` and `@ai-sdk/google` appear in `apps/web/package.json` dependencies
5. Import `ParcelProvider` in a test file — should compile
6. Import `searchAddress` in a test file — should compile
7. Verify new Tailwind classes work: `bg-score-high`, `text-sb-accent`, `bg-sb-card`
8. Verify `computeMaxFAR('M1-4/R7A', 4.6, 2.0, 0)` returns `6.6` (MX sum, not max)
9. Verify `computeScore(4.0, 25000, 0)` returns `'high'` (100K SF potential)

---

## Phase 2: Address Search + Map Pins ✅ COMPLETE

### Goal
Build the search bar with live autocomplete from LA GeoSearch API, and render pinned parcels as colored dots on the map. When a user selects an address, a pin appears immediately at the correct coordinates.

### Prerequisites
- Phase 1 complete (types, context, geosearch client, design tokens, shadcn components)

### Completion Notes
- All 3 new files created (`address-search.tsx`, `parcel-map-layers.ts`, `map-tooltip.tsx`) and 2 files modified (`la-map.tsx`, `page.tsx`)
- `ScatterplotLayer` imported from `'deck.gl'` instead of `'@deck.gl/layers'` — pnpm doesn't hoist the `@deck.gl/layers` subpackage, but `deck.gl` umbrella re-exports it
- `useRef<NodeJS.Timeout>()` changed to `useRef<NodeJS.Timeout>(undefined)` — React 19 requires an explicit initial argument
- Pin radius uses `radiusUnits: 'pixels'` with `getRadius: 6` (normal) / `10` (hovered) instead of spec's meter-based values — meter-based values caused hover expansion to be invisible due to `radiusMinPixels`/`radiusMaxPixels` clamping at most zoom levels
- Stroke renders on hovered pin only (no `lineWidthMinPixels`) — spec's `stroked: true` + `lineWidthMinPixels: 2` would have given all pins a white border
- Map flies to every newly-pinned parcel (not just the first) via `useEffect` watching `parcels.length`
- "Already pinned" feedback shown as temporary inline message below input, auto-dismisses after 2 seconds
- Agent call is stubbed: dispatches `PARCEL_ERROR` with "Agent not yet implemented" after 1-second timeout (Phase 3 replaces this)
- Build passes (`next build` compiles, TypeScript checks pass)

### Files to Create

#### 1. `apps/web/components/address-search.tsx`

A search input overlaid on the map with autocomplete dropdown.

**Behavior:**
- Positioned absolute at the top-center of the map panel, `z-10`
- Uses the shadcn `Input` component from `@workspace/ui/components/input`
- On keystroke: debounce 300ms, call `searchAddress()` from `lib/api/geosearch`
- Show dropdown with results (max 5). Each item shows: address label, borough
- On select:
  1. Dispatch `PIN_PARCEL` with `{ bbl, address, borough, lat, lng, status: 'loading' }`
  2. Clear the input and close the dropdown
  3. Trigger the agent call (Phase 3 will implement the actual agent — for now, dispatch `PARCEL_ERROR` with message "Agent not yet implemented" after a 1-second timeout as a placeholder)
- On blur or Escape: close dropdown
- Prevent duplicate pins: if BBL already exists in state, show a brief "Already pinned" message instead

**Styling:**
- Container: `absolute top-4 left-1/2 -translate-x-1/2 z-10 w-[360px]`
- Input: `bg-sb-card/90 backdrop-blur-sm border-white/10 text-foreground placeholder:text-muted-foreground font-mono text-sm`
- Dropdown: `bg-sb-card border border-white/10 rounded-lg shadow-xl mt-1 max-h-[240px] overflow-y-auto`
- Dropdown items: `px-3 py-2 hover:bg-white/5 cursor-pointer text-sm font-mono`

**Debounce implementation:** Use a `useRef` + `setTimeout` pattern (no external library needed):
```typescript
const timerRef = useRef<NodeJS.Timeout>()
function handleChange(value: string) {
  setQuery(value)
  clearTimeout(timerRef.current)
  timerRef.current = setTimeout(() => {
    searchAddress(value).then(setResults)
  }, 300)
}
```

#### 2. `apps/web/components/parcel-map-layers.ts`

Factory function that creates a DeckGL `ScatterplotLayer` from the parcel context state.

```typescript
import { ScatterplotLayer } from '@deck.gl/layers'
import type { PinnedParcel } from '@/lib/types'

// RGB color tuples for DeckGL
const SCORE_COLORS = {
  loading: [107, 159, 255] as [number, number, number],     // sb-accent blue
  high:    [34, 197, 94] as [number, number, number],        // score-high green
  med:     [245, 158, 11] as [number, number, number],       // score-med yellow
  low:     [239, 68, 68] as [number, number, number],        // score-low red
  error:   [120, 120, 120] as [number, number, number],      // gray
}

function getParcelColor(parcel: PinnedParcel): [number, number, number] {
  if (parcel.status === 'loading') return SCORE_COLORS.loading
  if (parcel.status === 'error') return SCORE_COLORS.error
  if (!parcel.data) return SCORE_COLORS.loading

  // Use server-computed composite score (farUpside × lotArea, penalized by constraints)
  return SCORE_COLORS[parcel.data.score]
}

export function createParcelLayer(
  parcels: PinnedParcel[],
  hoveredBBL: string | null,
  onHover: (info: { object?: PinnedParcel; x: number; y: number }) => void,
  onClick: (info: { object?: PinnedParcel }) => void,
) {
  return new ScatterplotLayer<PinnedParcel>({
    id: 'parcels',
    data: parcels,
    getPosition: (d) => [d.lng, d.lat],
    getFillColor: (d) => getParcelColor(d),
    getLineColor: [255, 255, 255],
    getRadius: (d) => (d.bbl === hoveredBBL ? 30 : 20),
    getLineWidth: (d) => (d.bbl === hoveredBBL ? 2 : 0),
    radiusMinPixels: 5,
    radiusMaxPixels: 15,
    lineWidthMinPixels: 2,
    stroked: true,
    filled: true,
    pickable: true,
    onHover,
    onClick,
    updateTriggers: {
      getRadius: hoveredBBL,
      getLineWidth: hoveredBBL,
      getFillColor: parcels.map(p => `${p.bbl}-${p.status}-${p.data?.farUpside}`),
    },
  })
}
```

**Score-based pin colors:**
- `high` → green (large composite potential: farUpside × lotArea ≥ 100K SF)
- `med` → yellow (moderate: 30K–100K SF)
- `low` → red (limited: <30K SF)
- Loading → blue (sb-accent)
- Error → gray

The `score` field is computed server-side by `computeScore()` in `lib/zoning.ts`. It uses a composite formula (FAR upside × lot area, penalized by constraint count) rather than FAR upside alone, because a large lot with moderate FAR upside is a better development opportunity than a tiny lot with high FAR upside.

#### 3. `apps/web/components/map-tooltip.tsx`

Tooltip that appears when hovering a parcel pin on the map.

**Props:** `{ parcel: PinnedParcel | null; x: number; y: number }`

**Behavior:**
- Render only when `parcel` is not null
- Position: `absolute`, `left: x + 12px`, `top: y - 12px` (offset from cursor)
- Prevent overflow: if tooltip would go off-screen right, flip to left of cursor
- If parcel is loading: show address + "Analyzing..."
- If parcel is ready: show address, zoning, built FAR → max FAR, lot area, constraint flags

**Styling:**
- `bg-sb-card border border-white/10 rounded-lg shadow-xl px-3 py-2 pointer-events-none`
- `font-mono text-xs`
- Address: `text-foreground font-semibold`
- Data rows: `text-muted-foreground`

### Files to Modify

#### 4. `apps/web/components/la-map.tsx`

Modify the existing map component to:

1. Import and consume `useParcelState` and `useParcelDispatch` from context
2. Add the `ScatterplotLayer` from `parcel-map-layers.ts` to DeckGL's `layers` prop
3. Track tooltip state: `{ parcel, x, y }` updated from the layer's `onHover` callback
4. On layer `onHover`: dispatch `SET_HOVERED` with the parcel's BBL (or `null`)
5. Render `MapTooltip` component
6. Keep initial view at LA-wide (zoom 11) — when first parcel is pinned, animate to its coordinates using `viewState` + `onViewStateChange` pattern
7. Accept `onViewStateChange` prop or manage viewState internally to support fly-to

**View state management for fly-to:**
- Convert from `initialViewState` (uncontrolled) to `viewState` (controlled) with `onViewStateChange`
- Expose a `flyTo(lat, lng)` function via a ref or callback prop that the parent can call
- Alternatively, use a `useEffect` that watches `parcels.length` — when a new parcel is added, fly to its coordinates

**Key change to existing code:**
```diff
- <DeckGL initialViewState={INITIAL_VIEW_STATE} controller ...>
+ <DeckGL viewState={viewState} onViewStateChange={({viewState}) => setViewState(viewState)} controller layers={[parcelLayer]} ...>
```

#### 5. `apps/web/app/page.tsx`

Wrap the page content with `ParcelProvider`:

```typescript
import { ParcelProvider } from '@/lib/parcel-context'
import { Sidebar } from '@/components/sidebar'
import { LAMap } from '@/components/la-map'
import { AddressSearch } from '@/components/address-search'

export default function Page() {
  return (
    <ParcelProvider>
      <div className="flex h-svh w-full overflow-hidden">
        <Sidebar />
        <main className="relative flex-1">
          <AddressSearch />
          <LAMap />
        </main>
      </div>
    </ParcelProvider>
  )
}
```

> **Note:** The 42/58 split with the table panel will be added in Phase 4. For now, the map takes the full remaining width. The search bar overlays the map.

### Verification

1. `pnpm dev` — app compiles, map loads
2. Search bar is visible at top-center of the map
3. Type "120 Broadway" — autocomplete dropdown appears with real LA addresses from GeoSearch API
4. Select a result — a blue pin appears on the map at the correct location
5. Map animates (flies) to the pinned location
6. Hover the pin — tooltip shows address and "Analyzing..." (since agent isn't wired yet)
7. Type another address — second pin appears, map adjusts
8. Typing an already-pinned address shows "Already pinned" feedback
9. No console errors

---

## Phase 3: Agent API Route ✅ COMPLETE

### Goal
Build the server-side API route that takes a BBL + coordinates, fetches data deterministically from PLUTO, FEMA, DCP GIS, and the MIH layer, computes derived fields, then passes structured data to Gemini for interpretation only. Returns a plain JSON response (not SSE stream). This phase is independent of Phase 2 — it can be built and tested in isolation.

### Prerequisites
- Phase 1 complete (types, `lib/zoning.ts`, dependencies installed)
- `.env.local` populated with `GOOGLE_GENERATIVE_AI_API_KEY` and `LA_OPENDATA_TOKEN`

### Completion Notes
- 1 new file created (`app/api/agent/route.ts`) and `zod` added as direct dependency to `apps/web/package.json`
- `zod` was deferred from Phase 1 — now installed as a direct dependency (not relying on transitive resolution through `ai` package, which pnpm's strict `node_modules` doesn't hoist)
- DCP GIS zoning result is used as a fallback for `zoningDistrict` (`pluto.zonedist1 || gis?.zoningDistrict || ''`) — the spec fetched GIS data but never referenced it in the assembled `parcelData`. Fallback handles edge cases where PLUTO's `zonedist1` is empty for newly created lots
- `outFields` for GIS zoning reduced to just `ZONEDIST` (dropped `SHAPE_Area` since it was unused)
- Gemini `generateObject()` wrapped in try/catch — on failure, returns fallback interpretation text (`"Interpretation temporarily unavailable. All data fields are accurate."`) instead of 500-ing the entire request. All deterministic data is still returned.
- `req.json()` wrapped in try/catch — returns 400 on malformed JSON instead of unhandled exception
- `mihBonusFAR` remains `null` as specified — MIH bonus FAR depends on developer-elected option (Option 1/2/Deep Affordability) and is not deterministically computable from GIS data alone
- Phase 2's agent stub in `address-search.tsx` (lines 65-72) is NOT modified — Phase 4 handles wiring the search to the agent API
- Build passes (`tsc --noEmit` compiles, TypeScript checks pass)

### Files to Create

#### 1. `apps/web/app/api/agent/route.ts`

Next.js Route Handler. Two-phase architecture:
- **Phase A:** Fetch all external data deterministically (PLUTO, FEMA, DCP GIS, MIH) in parallel with timeouts
- **Phase B:** Pass structured data to Gemini via `generateObject` for interpretation text only

All computed fields (maxFAR, score, farUpside) use deterministic functions from `lib/zoning.ts`, not LLM output.

**Request shape:**

```typescript
POST /api/agent
Content-Type: application/json

{
  "bbl": "1000477501",
  "lat": 40.7081,
  "lng": -74.0105,
  "address": "120 BROADWAY"
}
```

**Implementation:**

```typescript
import { generateObject } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'
import { computeMaxFAR, computeScore } from '@/lib/zoning'

// Vercel serverless timeout — 3 external APIs + Gemini needs >10s default
export const maxDuration = 30

// PLUTO resource ID changes with each annual release (currently 24v4).
// Override via env var when a new PLUTO version is published.
const PLUTO_RESOURCE_ID = process.env.PLUTO_RESOURCE_ID || '64uk-42ks'

// ── Input Validation ──

const RequestSchema = z.object({
  bbl: z.string().regex(/^\d{10}$/, 'BBL must be exactly 10 digits'),
  lat: z.number().min(40.4, 'Latitude out of LA range').max(40.95),
  lng: z.number().min(-74.3, 'Longitude out of LA range').max(-73.7),
  address: z.string().min(1).max(200),
})

// ── Route Handler ──

export async function POST(req: Request) {
  const body = await req.json()
  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    )
  }
  const { bbl, lat, lng, address } = parsed.data

  // Phase A: Deterministic data fetching (parallel, with timeouts)
  const [plutoResult, floodResult, zoningResult, mihResult] = await Promise.allSettled([
    fetchPLUTO(bbl),
    fetchFloodZone(lat, lng),
    fetchZoningGIS(lat, lng),
    fetchMIH(lat, lng),
  ])

  // PLUTO is required — everything else degrades gracefully
  const pluto = plutoResult.status === 'fulfilled' ? plutoResult.value : null
  if (!pluto) {
    return Response.json({ error: 'PLUTO data not found for this BBL' }, { status: 404 })
  }

  const flood = floodResult.status === 'fulfilled'
    ? floodResult.value
    : { floodZone: null, isFloodHazard: false }
  const gis = zoningResult.status === 'fulfilled' ? zoningResult.value : null
  const mih = mihResult.status === 'fulfilled'
    ? mihResult.value
    : { mihArea: null, mihBonusFAR: null }

  // Compute derived fields deterministically
  const zoningDistrict = pluto.zonedist1 || ''
  const residFAR = parseFloat(pluto.residfar) || 0
  const commFAR = parseFloat(pluto.commfar) || 0
  const facilFAR = parseFloat(pluto.facilfar) || 0
  const builtFAR = parseFloat(pluto.builtfar) || 0
  const lotArea = parseFloat(pluto.lotarea) || 0

  const maxFAR = computeMaxFAR(zoningDistrict, residFAR, commFAR, facilFAR)
  const farUpside = Math.max(0, maxFAR - builtFAR)
  const maxBuildableSF = lotArea * maxFAR

  const constraintCount = [
    flood.isFloodHazard,
    !!pluto.edesignum,
    !!pluto.landmark,
    !!pluto.histdist,
  ].filter(Boolean).length

  const score = computeScore(farUpside, lotArea, constraintCount)

  // Assemble structured parcel data
  const parcelData = {
    zoningDistrict,
    commercialOverlay: pluto.overlay1 || null,
    specialDistrict: pluto.spdist1 || null,
    mihArea: mih.mihArea || null,
    mihBonusFAR: mih.mihBonusFAR || null,
    lotArea,
    lotFrontage: parseFloat(pluto.lotfront) || 0,
    lotDepth: parseFloat(pluto.lotdepth) || 0,
    builtFAR,
    residFAR,
    commFAR,
    facilFAR,
    buildingClass: pluto.bldgclass || '',
    yearBuilt: parseInt(pluto.yearbuilt) || 0,
    numFloors: parseInt(pluto.numfloors) || 0,
    unitsRes: parseInt(pluto.unitsres) || 0,
    unitsTotal: parseInt(pluto.unitstotal) || 0,
    buildingArea: parseFloat(pluto.bldgarea) || 0,
    ownerName: pluto.ownername || '',
    landmark: pluto.landmark || null,
    histDist: pluto.histdist || null,
    eDesigNum: pluto.edesignum || null,
    floodZone: flood.floodZone || null,
    isFloodHazard: flood.isFloodHazard ?? false,
    maxFAR,
    farUpside,
    maxBuildableSF,
    score,
  }

  // Phase B: Gemini generates interpretation text only
  const { object } = await generateObject({
    model: google(GeminiModel.PRO),
    schema: z.object({
      interpretation: z
        .string()
        .describe(
          '2-4 sentence development potential assessment for a real estate professional. ' +
          'Be specific about numbers. Flag risks. Mention FAR upside in terms of buildable SF. ' +
          'Note constraints (flood, landmark, E-designation, MIH requirements). Be direct.',
        ),
    }),
    system: SYSTEM_PROMPT,
    prompt: `Analyze this parcel at ${address}:\n${JSON.stringify(parcelData, null, 2)}`,
  })

  return Response.json({ ...parcelData, interpretation: object.interpretation })
}
```

**System prompt (`SYSTEM_PROMPT` constant):**

```typescript
const SYSTEM_PROMPT = `You are a LA real estate development analyst. You will receive structured data about a specific tax lot including zoning, lot characteristics, FAR values, applicable overlays, MIH status, incentive eligibility, and constraint flags.

Your job is to synthesize this into a concise development potential assessment.

RULES:
- Never invent data. Only reference what is provided in the structured input.
- Distinguish between facts (from city data) and your interpretation.
- If something is uncertain, say "verify with zoning counsel."
- Be direct. The reader is a real estate professional, not a layperson.
- Keep the interpretation to 2-4 sentences.
- Reference specific zoning sections when relevant.
- If the parcel is in an MIH area, note the affordability requirements and their impact on development economics.`
```

**Data fetching functions (all in the same file):**

```typescript
// ── PLUTO (Socrata SODA API) ──

async function fetchPLUTO(bbl: string) {
  const token = process.env.LA_OPENDATA_TOKEN
  const url = new URL(`https://data.cityofnewyork.us/resource/${PLUTO_RESOURCE_ID}.json`)
  // bbl is already validated as 10 digits by RequestSchema
  url.searchParams.set('$where', `bbl='${bbl}'`)

  const res = await fetch(url.toString(), {
    headers: token ? { 'X-App-Token': token } : {},
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) throw new Error(`PLUTO API error: ${res.status}`)
  const data = await res.json()
  if (data.length === 0) throw new Error(`No PLUTO data for BBL ${bbl}`)
  return data[0]
}

// ── FEMA Flood Zone ──

async function fetchFloodZone(lat: number, lng: number) {
  try {
    const url = new URL(
      'https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/28/query',
    )
    url.searchParams.set('geometry', `${lng},${lat}`)
    url.searchParams.set('geometryType', 'esriGeometryPoint')
    url.searchParams.set('spatialRel', 'esriSpatialRelIntersects')
    url.searchParams.set('outFields', 'FLD_ZONE,ZONE_SUBTY,SFHA_TF')
    url.searchParams.set('returnGeometry', 'false')
    url.searchParams.set('f', 'json')
    url.searchParams.set('inSR', '4326')

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(5000), // FEMA is notoriously slow
    })
    if (!res.ok) throw new Error(`FEMA HTTP ${res.status}`)
    const data = await res.json()

    if (!data.features?.length) {
      return { floodZone: null, isFloodHazard: false }
    }

    const attrs = data.features[0].attributes
    return {
      floodZone: attrs.FLD_ZONE,
      isFloodHazard: attrs.SFHA_TF === 'T',
    }
  } catch (err) {
    console.warn('FEMA flood zone check failed:', err)
    return { floodZone: null, isFloodHazard: false }
  }
}

// ── DCP GIS Zoning ──

async function fetchZoningGIS(lat: number, lng: number) {
  try {
    const url = new URL(
      'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/nyzd/FeatureServer/0/query',
    )
    url.searchParams.set('geometry', `${lng},${lat}`)
    url.searchParams.set('geometryType', 'esriGeometryPoint')
    url.searchParams.set('spatialRel', 'esriSpatialRelIntersects')
    url.searchParams.set('outFields', 'ZONEDIST')
    url.searchParams.set('returnGeometry', 'false')
    url.searchParams.set('f', 'json')
    url.searchParams.set('inSR', '4326')

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error(`DCP GIS HTTP ${res.status}`)
    const data = await res.json()

    if (!data.features?.length) return null

    return {
      zoningDistrict: data.features[0].attributes.ZONEDIST,
      shapeArea: data.features[0].attributes.SHAPE_Area,
    }
  } catch (err) {
    console.warn('DCP GIS zoning check failed:', err)
    return null
  }
}

// ── DCP MIH (Mandatory Inclusionary Housing) ──

async function fetchMIH(lat: number, lng: number) {
  try {
    // Note: verify this ArcGIS service URL at implementation time.
    // Search https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/
    // for "Inclusionary" or "MIH" if the URL below does not resolve.
    const url = new URL(
      'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/' +
      'LADCP_Inclusionary_Housing_Designated_Areas/FeatureServer/0/query',
    )
    url.searchParams.set('geometry', `${lng},${lat}`)
    url.searchParams.set('geometryType', 'esriGeometryPoint')
    url.searchParams.set('spatialRel', 'esriSpatialRelIntersects')
    url.searchParams.set('outFields', 'PROJECTNAM,IH_RULES')
    url.searchParams.set('returnGeometry', 'false')
    url.searchParams.set('f', 'json')
    url.searchParams.set('inSR', '4326')

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return { mihArea: null, mihBonusFAR: null }
    const data = await res.json()

    if (!data.features?.length) return { mihArea: null, mihBonusFAR: null }

    const attrs = data.features[0].attributes
    return {
      mihArea: attrs.IH_RULES || attrs.PROJECTNAM || 'MIH Designated',
      mihBonusFAR: null, // MIH bonus FAR varies by option; Gemini interprets
    }
  } catch (err) {
    console.warn('MIH layer check failed:', err)
    return { mihArea: null, mihBonusFAR: null }
  }
}
```

### Verification

Test the endpoint directly with curl (requires API keys in `.env.local`):

```bash
# Test with a known LA address (120 Broadway, Manhattan)
curl -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"bbl":"1000477501","lat":40.7081,"lng":-74.0105,"address":"120 BROADWAY"}'
```

Expected behavior:

1. Response is plain JSON (not SSE stream)
2. Contains all `ParcelData` fields including `score`, `mihArea`, `interpretation`
3. `maxFAR` for MX districts equals `residFAR + commFAR` (not `max()`)
4. `score` reflects composite (farUpside × lotArea) calculation
5. Response time < 10s (parallel fetches + Gemini)
6. No 500 errors — FEMA/GIS failures degrade gracefully to null values

**Input validation tests:**

```bash
# Invalid BBL — should return 400
curl -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"bbl":"abc","lat":40.7,"lng":-74,"address":"test"}'

# BBL not found in PLUTO — should return 404
curl -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"bbl":"0000000000","lat":40.7,"lng":-74,"address":"NONEXISTENT"}'
```

**Additional test addresses:**

- `{"bbl":"3004350001","lat":40.6782,"lng":-73.9842,"address":"475 KENT AVE"}` (Williamsburg, residential)
- `{"bbl":"1005890040","lat":40.7580,"lng":-73.9855,"address":"1515 BROADWAY"}` (Times Square, commercial)
- `{"bbl":"3003920042","lat":40.6748,"lng":-73.9892,"address":"130 4TH AVE"}` (Gowanus MX district — verify FAR is summed)

---

## Phase 4: Table + Agent Integration ✅ COMPLETE

### Goal
Build the comparison table, wire the address search to the agent API, show progress as the agent analyzes, and populate table rows with live data. This is where horizontal comparison becomes functional.

### Completion Notes
- All 6 new files created as specified, plus 1 additional file (`lib/api/agent-client.ts`) to extract shared fetch logic
- Agent API returns plain JSON (not SSE stream), so progress is a single static "Analyzing parcel..." message — no granular per-tool updates
- **Spec deviation — AbortController redesign:** The spec used a single shared `AbortController` that aborted the previous request when a new address was pinned (verification step 10: "first request is aborted cleanly"). This was changed to a per-BBL `Map<string, AbortController>` so multiple parcels can load concurrently — essential for a comparison tool. Abort only occurs on unmount or explicit parcel removal.
- **Spec deviation — retry architecture:** The spec's `AgentStatus` component had no `onRetry` prop and no mechanism for retry to reach the fetch logic. Added `onRetry` callback prop. Extracted `fetchAgentData()` into `lib/api/agent-client.ts` so both `address-search.tsx` and `comparison-table.tsx` can call the agent independently.
- **Reducer change:** `UPDATE_PROGRESS` action now also resets `status` to `'loading'` and clears `error`, enabling retry from error state without needing a new action type
- `AgentStatus` component includes `onRetry` prop (not in original spec) to support retry from table rows
- Loading/error rows render Address cell + `colSpan={5}` AgentStatus + Actions cell (remove button always available, even for loading parcels)
- `page.tsx` no longer needs `'use client'` directive — Dashboard handles client-side rendering
- Build passes (`next build` compiles, TypeScript checks pass)

### Prerequisites
- Phase 2 complete (search bar, map pins, context wired)
- Phase 3 complete (agent API route working)

### Files to Create

#### 1. `apps/web/components/constraint-tag.tsx`

Small colored badge for parcel constraints.

**Props:** `{ type: ConstraintType }` where `ConstraintType` is `'FLOOD' | 'E-DESIG' | 'LANDMARK' | 'HISTORIC'`

**Color mapping:**
- `FLOOD` → `bg-blue-500/20 text-blue-400 border-blue-500/30`
- `E-DESIG` → `bg-amber-500/20 text-amber-400 border-amber-500/30`
- `LANDMARK` → `bg-purple-500/20 text-purple-400 border-purple-500/30`
- `HISTORIC` → `bg-orange-500/20 text-orange-400 border-orange-500/30`

Uses the shadcn `Badge` component with `variant="outline"` and `font-mono text-[10px] uppercase px-1.5 py-0`.

#### 2. `apps/web/components/agent-status.tsx`

Displays the real-time progress of the agent as it works.

**Props:** `{ progress?: string; status: ParcelStatus; error?: string; onRetry?: () => void }`

**Rendering:**
- `loading` status: animated spinner + progress text (e.g., "Fetching parcel data...")
- `error` status: red text with error message + retry button
- `ready` status: not rendered (the data cells show instead)

**Styling:** `text-xs font-mono text-muted-foreground` with a `animate-pulse` on the spinner.

#### 3. `apps/web/components/comparison-table.tsx`

The main table component. Uses shadcn `Table` components.

**Columns:**
| Column | Width | Content | Sortable |
|--------|-------|---------|----------|
| Address | 180px | Address (bold) + borough (muted, below) | Yes (`address`) |
| Zoning | 90px | Zoning district in mono | Yes (`zoningDistrict`) |
| Lot Area | 100px | Formatted with commas + "SF" | Yes (`lotArea`) |
| Built FAR | 120px | `builtFAR → maxFAR` with colored delta `(+farUpside)` | Yes (`farUpside`) |
| Max Buildable | 120px | Formatted SF | Yes (`maxBuildableSF`) |
| Constraints | 140px | Array of `ConstraintTag` components | No |
| Actions | 40px | Remove button (X icon) | No |

**Behavior:**
- Consume `useParcelState()` for parcels, hoveredBBL, sort state
- Consume `useParcelDispatch()` for SET_HOVERED, SET_SORT, REMOVE_PARCEL
- Sort parcels in `useMemo` based on `sortColumn` + `sortDirection`
- Only sort parcels with `status === 'ready'` — loading/error parcels float to the top
- Column headers: clickable, show sort arrow indicator (↑/↓)
- Row hover: `onMouseEnter` → dispatch `SET_HOVERED`, `onMouseLeave` → dispatch `SET_HOVERED(null)`
- Row highlight: if `hoveredBBL === row.bbl`, apply `bg-white/5`
- If parcel is loading/error: span the data columns with `AgentStatus` component
- If parcel is ready: render data cells with formatted values

**Constraint extraction logic:**
```typescript
function getConstraints(data: ParcelData): ConstraintType[] {
  const constraints: ConstraintType[] = []
  if (data.isFloodHazard) constraints.push('FLOOD')
  if (data.eDesigNum) constraints.push('E-DESIG')
  if (data.landmark) constraints.push('LANDMARK')
  if (data.histDist) constraints.push('HISTORIC')
  return constraints
}
```

**FAR delta coloring (uses server-computed `score`):**
- `score === 'high'` → `text-score-high` (green)
- `score === 'med'` → `text-score-med` (yellow)
- `score === 'low'` → `text-score-low` (red)

#### 4. `apps/web/components/summary-bar.tsx`

Aggregation bar at the bottom of the table panel.

**Metrics (computed from all `ready` parcels):**
- Total Buildable SF: sum of `maxBuildableSF`
- Avg FAR Upside: mean of `farUpside`
- Parcels with Constraints: count where `getConstraints(data).length > 0`
- Parcel count: `{ready} of {total} analyzed`

**Styling:**
- `border-t border-white/10 bg-sb-card px-4 py-3`
- Metrics displayed in a horizontal flex row with `gap-6`
- Each metric: label in `text-muted-foreground text-[10px] uppercase` above, value in `text-foreground text-sm font-mono font-semibold` below
- If no ready parcels: show "Pin addresses to compare parcels" in muted text

#### 5. `apps/web/components/dashboard.tsx`

Orchestrator component that creates the 42/58 split layout.

```typescript
'use client'

import { LAMap } from './la-map'
import { AddressSearch } from './address-search'
import { ComparisonTable } from './comparison-table'
import { SummaryBar } from './summary-bar'

export function Dashboard() {
  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Map Panel */}
      <div className="relative w-[42%] min-w-[320px]">
        <AddressSearch />
        <LAMap />
      </div>

      {/* Table Panel */}
      <div className="flex w-[58%] min-w-[400px] flex-col border-l border-border">
        <div className="flex-1 overflow-y-auto">
          <ComparisonTable />
        </div>
        <SummaryBar />
      </div>
    </div>
  )
}
```

### Files to Modify

#### 6. `apps/web/lib/api/agent-client.ts` (new — not in original spec)

Shared fetch logic extracted so both `address-search.tsx` and `comparison-table.tsx` (retry) can call the agent independently.

```typescript
import type { ParcelData } from '@/lib/types'

export async function fetchAgentData(
  params: { bbl: string; lat: number; lng: number; address: string },
  signal?: AbortSignal,
): Promise<ParcelData>
```

#### 7. `apps/web/components/address-search.tsx` (from Phase 2)

Replace the placeholder agent call with a real call to `/api/agent` via `fetchAgentData()`.

Uses a per-BBL `Map<string, AbortController>` so multiple parcels can load concurrently. Each parcel gets its own controller; abort only occurs on unmount or explicit removal.

**On address select:**

1. Dispatch `PIN_PARCEL` with `status: 'loading'`
2. Create a new `AbortController` for this BBL, store in the map
3. Dispatch `UPDATE_PROGRESS` with `"Analyzing parcel..."`
4. Call `fetchAgentData({ bbl, lat, lng, address }, signal)`
5. On success: dispatch `PARCEL_READY` with the parsed `ParcelData`
6. On `AbortError`: silently ignore (intentional cancellation)
7. On other error: dispatch `PARCEL_ERROR`
8. In `finally`: remove controller from map

**Cleanup on unmount:** iterate and abort all controllers in the map.

> **Trade-off note:** We lose the granular per-tool progress updates ("Fetching PLUTO...", "Checking flood zone...") in favor of a single "Analyzing parcel..." message. This is acceptable because the total request time is ~3-5s (parallel fetches + Gemini), and the reliability gain from `generateObject` far outweighs the UX loss of granular progress.

#### 8. `apps/web/app/page.tsx`

Replace the current layout with the Dashboard component:

```typescript
import { ParcelProvider } from '@/lib/parcel-context'
import { Sidebar } from '@/components/sidebar'
import { Dashboard } from '@/components/dashboard'

export default function Page() {
  return (
    <ParcelProvider>
      <div className="flex h-svh w-full overflow-hidden">
        <Sidebar />
        <Dashboard />
      </div>
    </ParcelProvider>
  )
}
```

### Verification

1. `pnpm dev` — app loads with sidebar + 42/58 split (map left, empty table right)
2. Table shows empty state: "Pin addresses to compare parcels"
3. Search "120 Broadway" → select → pin appears (blue, loading)
4. Table row appears with "Analyzing parcel..." progress indicator
5. After ~3-5s, row populates with real data: zoning, lot area, FAR values, MIH status, constraints
6. Pin color changes from blue to green/yellow/red based on composite score
7. Hover the pin → corresponding table row highlights
8. Hover a table row → corresponding pin on map gets larger/highlighted
9. Search and pin a second address → second row appears, summary bar updates
10. Pin a second address while first is still loading → both load independently (concurrent per-BBL controllers)
11. Click sort on "Lot Area" column → rows reorder (loading/error parcels stay at top)
12. Click remove (X) on a row → pin disappears from map, row removed
13. Summary bar shows: total buildable SF, avg FAR upside, constrained count, parcel count
14. Agent error → retry button in table row re-triggers analysis
15. Navigate away during loading → no console errors (cleanup via AbortController)

---

## Phase 5: Polish + Sync ✅ COMPLETE

### Goal
Ensure bidirectional hover sync works flawlessly, add transition animations, handle edge cases, and polish the overall UX.

### Completion Notes
- Bidirectional hover sync was already working from Phase 4; added `transition-colors duration-150` for smooth highlight and scroll-into-view for map→table hover
- Scroll-into-view uses a ref map + hover-source guard to prevent table scrolling when user hovers within the table itself (only map-originated hovers trigger scroll)
- Map pin transitions: added `transitions: { getRadius: 150, getLineWidth: 150 }` to ScatterplotLayer for smooth size animation
- Search dropdown: switched from conditional rendering to opacity-based transition (`transition-opacity duration-150`) with `pointer-events-none` when hidden
- Summary bar metrics: created `useAnimatedNumber` hook (`lib/hooks/use-animated-number.ts`) using `requestAnimationFrame` for smooth number interpolation (Total Buildable, Avg FAR Upside)
- Empty state: upgraded to MapPin icon + "Search an address to get started" + subtext (supersedes Phase 4 placeholder text)
- GeoSearch error: added `.catch()` for network failures, shows "Search unavailable" in dropdown, clears on next keystroke
- Keyboard accessibility: ArrowDown/ArrowUp navigate dropdown results, Enter selects, Escape closes, active item highlighted
- **Spec deviation**: Map auto-fit now triggers on both add AND remove (not just add). On 0 parcels resets to LA overview, 1 parcel flies to zoom 15, 2+ parcels uses `WebMercatorViewport.fitBounds` with padding
- Network error banner: skipped (spec marked optional; GeoSearch error + agent retry cover critical paths)
- Build passes (`next build` compiles, TypeScript checks pass)

### Prerequisites
- Phase 4 complete (full flow working end-to-end)

### Tasks

#### 1. Bidirectional Hover Sync
- **Map → Table**: hovering a pin dispatches `SET_HOVERED` → table row gets `bg-white/5` highlight + optionally scrolls into view
- **Table → Map**: hovering a table row dispatches `SET_HOVERED` → pin enlarges (radius 1.5x) and gets a white stroke ring
- Verify both directions work simultaneously with no flicker or feedback loops
- On `mouseleave` from both map and table panel, dispatch `SET_HOVERED(null)`

#### 2. Scroll Into View
When hovering a pin on the map, if the corresponding table row is scrolled out of view, smoothly scroll it into view:
```typescript
const rowRef = useRef<HTMLTableRowElement>(null)
useEffect(() => {
  if (hoveredBBL === parcel.bbl && rowRef.current) {
    rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }
}, [hoveredBBL])
```

#### 3. Transition Animations
- Table row highlight: `transition-colors duration-150`
- Map pin radius change: handled by DeckGL's built-in transitions — add `transitions: { getRadius: 150 }` to the ScatterplotLayer
- Search dropdown appear/disappear: `transition-opacity duration-150`
- Summary bar metric changes: `transition-all duration-300` on the number values

#### 4. Empty State
When no parcels are pinned, the table panel shows a centered empty state:
- Icon: `MapPin` from lucide-react (large, muted)
- Text: "Search an address to get started"
- Subtext: "Pin LA addresses to compare development potential"
- Styling: `flex flex-col items-center justify-center h-full text-muted-foreground`

#### 5. Error Handling
- **GeoSearch fails**: show "Search unavailable" in the dropdown with a retry hint
- **Agent fails**: table row shows error state with red text and a "Retry" button. On retry, dispatch `PIN_PARCEL` again (reset status to loading) and re-call the agent
- **Individual tool fails**: the agent should handle gracefully — if FEMA is down, it still returns PLUTO data with `floodZone: null`
- **Network error**: global toast/notification (optional — can use a simple absolute-positioned error banner)

#### 6. Map Auto-Fit Bounds
When multiple parcels are pinned, fit the map view to show all pins:
```typescript
import { WebMercatorViewport } from '@deck.gl/core'

// When parcels change, compute bounds and fit
const bounds = parcels.reduce(
  (b, p) => ({
    minLng: Math.min(b.minLng, p.lng),
    maxLng: Math.max(b.maxLng, p.lng),
    minLat: Math.min(b.minLat, p.lat),
    maxLat: Math.max(b.maxLat, p.lat),
  }),
  { minLng: Infinity, maxLng: -Infinity, minLat: Infinity, maxLat: -Infinity }
)
```
Only auto-fit when a new parcel is added, not on every render. On a single parcel, fly to it at zoom 15.

#### 7. Keyboard Accessibility
- Search bar: `Enter` selects the first result, `ArrowDown`/`ArrowUp` navigate the dropdown, `Escape` closes
- Table: no specific keyboard interactions needed for MVP

### Verification

1. Pin 3+ parcels at different locations — map auto-fits to show all pins
2. Hover a pin → correct table row highlights and scrolls into view if needed
3. Hover a table row → correct pin enlarges with smooth animation
4. Remove a parcel → pin and row disappear, summary bar updates, map adjusts bounds
5. Kill your network → search shows graceful error, agent shows error state with retry
6. Retry a failed parcel → agent re-runs and row populates
7. All transitions are smooth (no flicker, no jarring state changes)
8. Empty state shows when all parcels are removed

---

## Phase 6: Seed Data for Demo

### Goal

Create pre-analyzed parcel data for 10-15 Gowanus addresses so the demo can load instantly without relying on live API calls. This protects against API failures or slowness during the hackathon presentation.

### Prerequisites

- Phase 3 complete (agent API route working)

### Files to Create

#### 1. `apps/web/lib/data/gowanus-seed.ts`

Pre-analyzed Gowanus parcels for demo fallback. This file is generated by running the agent against real addresses, then saving the responses.

```typescript
import type { PinnedParcel } from '../types'

/**
 * Pre-analyzed Gowanus parcels for demo fallback.
 * Generated by running the agent against real addresses.
 * To regenerate: run `npx tsx scripts/generate-seed-data.ts`
 */
export const GOWANUS_SEED: PinnedParcel[] = [
  // Each entry is a complete PinnedParcel with status: 'ready' and populated data.
  // Addresses should include a mix of:
  //   - MX district parcels (M1-4/R7A, M1-4/R6A) to demo summed FAR
  //   - MIH-designated parcels to demo MIH status
  //   - Flood zone parcels (Gowanus Canal proximity)
  //   - Parcels with E-designations (former industrial)
  //   - A range of scores (high, med, low) for visual variety
  //
  // Example addresses to seed:
  //   130 4th Ave, 270 Nevins St, 363 Bond St, 500 Union St,
  //   175 3rd Ave, 420 Carroll St, 233 Butler St, 541 Smith St,
  //   65 9th St, 160 2nd Ave, 245 Douglass St, 372 Butler St
]
```

#### 2. `apps/web/scripts/generate-seed-data.ts`

One-time script that calls the agent API for a list of Gowanus addresses and writes the results to the seed file. Run pre-hackathon to populate the data.

```typescript
/**
 * Usage: npx tsx scripts/generate-seed-data.ts
 *
 * Requires:
 *   - pnpm dev running on localhost:3000
 *   - .env.local populated with API keys
 *
 * Steps:
 *   1. Define a list of Gowanus addresses with their BBLs and coordinates
 *   2. For each, call POST /api/agent
 *   3. Wrap each response as a PinnedParcel with status: 'ready'
 *   4. Write the array to lib/data/gowanus-seed.ts
 */
```

### Files to Modify

#### 3. `apps/web/components/dashboard.tsx` (or empty state component)

Add a "Load Demo" button in the table's empty state. On click, import `GOWANUS_SEED` and dispatch `PIN_PARCEL` + `PARCEL_READY` for each seed parcel:

```typescript
import { GOWANUS_SEED } from '@/lib/data/gowanus-seed'

function handleLoadDemo() {
  for (const parcel of GOWANUS_SEED) {
    dispatch({ type: 'PIN_PARCEL', parcel: { ...parcel, status: 'loading' } })
    if (parcel.data) {
      dispatch({ type: 'PARCEL_READY', bbl: parcel.bbl, data: parcel.data })
    }
  }
}
```

### Verification

1. Click "Load Demo" → 10-15 Gowanus parcels appear instantly on map and in table
2. No API calls are made (verify in Network tab)
3. Parcels show a mix of score colors (green, yellow, red)
4. MIH status appears on MIH-designated parcels
5. Flood zone flags appear for canal-adjacent parcels
6. Map auto-fits to show all Gowanus pins

---

## File Index

All files created or modified across all phases:

| Phase | Action | Path |
|-------|--------|------|
| 1 | Create | `apps/web/.env.example` |
| 1 | Create | `apps/web/lib/types.ts` |
| 1 | Create | `apps/web/lib/format.ts` |
| 1 | Create | `apps/web/lib/zoning.ts` (deterministic FAR + score computation) |
| 1 | Create | `apps/web/lib/parcel-context.tsx` |
| 1 | Create | `apps/web/lib/api/geosearch.ts` |
| 1 | Modify | `packages/ui/src/styles/globals.css` (add design tokens) |
| 1 | Install | shadcn: `table`, `badge`, `input` in packages/ui |
| 1 | Install | `ai`, `@ai-sdk/google` in apps/web |
| 2 | Create | `apps/web/components/address-search.tsx` |
| 2 | Create | `apps/web/components/parcel-map-layers.ts` |
| 2 | Create | `apps/web/components/map-tooltip.tsx` |
| 2 | Modify | `apps/web/components/la-map.tsx` (add layers, picking, fly-to) |
| 2 | Modify | `apps/web/app/page.tsx` (add ParcelProvider, AddressSearch) |
| 3 | Create | `apps/web/app/api/agent/route.ts` (generateObject, input validation, timeouts) |
| 4 | Create | `apps/web/components/constraint-tag.tsx` |
| 4 | Create | `apps/web/components/agent-status.tsx` |
| 4 | Create | `apps/web/components/comparison-table.tsx` |
| 4 | Create | `apps/web/components/summary-bar.tsx` |
| 4 | Create | `apps/web/components/dashboard.tsx` |
| 4 | Modify | `apps/web/components/address-search.tsx` (wire agent + AbortController) |
| 4 | Modify | `apps/web/app/page.tsx` (use Dashboard) |
| 5 | Modify | `apps/web/components/la-map.tsx` (auto-fit bounds, transitions) |
| 5 | Modify | `apps/web/components/comparison-table.tsx` (scroll-into-view) |
| 5 | Modify | `apps/web/components/address-search.tsx` (error handling, keyboard) |
| 6 | Create | `apps/web/lib/data/gowanus-seed.ts` (pre-analyzed demo parcels) |
| 6 | Create | `apps/web/scripts/generate-seed-data.ts` (seed data generator) |
| 6 | Modify | `apps/web/components/dashboard.tsx` (Load Demo button) |

---

*Layer 3 (Vertical Analysis Report — clicking a table row to view the full deep-dive) will be developed as a separate effort after the dashboard is complete.*
