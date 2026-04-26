# SiteBrief — Phase 8+ Implementation Plan

> Continuation of IMPLEMENTATION.md. Covers everything NOT yet built after Phases 1-7.
> Phases 1-5 delivered: address search, map pins with score colors, agent API (PLUTO + FEMA + DCP GIS + MIH + Gemini), comparison table with sorting/hover sync, polish (transitions, auto-fit bounds, error handling).
> Phase 6 (seed data) was skipped — live API flow is sufficient.
> Phase 7 delivered: parcel report deep-dive, side-by-side comparison, extended Gemini schema.
>
> This document covers the remaining features in priority order.

---

## What Exists After Phase 7

```
✅ Address search with LA GeoSearch autocomplete
✅ Map pins color-coded by development potential score
✅ Agent API route at /api/parcel (PLUTO + FEMA + DCP GIS + MIH → Gemini interpretation)
✅ Gemini returns structured incentives[], ceqrThresholds[], estimatedMaxHeight
✅ Comparison table with sortable columns, hover sync, summary bar
✅ Constraint tags (FLOOD, E-DESIG, LANDMARK, HISTORIC)
✅ Loading/error states with retry
✅ Auto-fit map bounds, smooth transitions
✅ Parcel report deep-dive (click table row → full intelligence briefing)
   - 5 sections: Development Potential, Incentives, Constraints, CEQR, Existing Conditions
   - Key metrics grid, AI analysis block, source tags, constraint status rows
   - Prev/Next navigation between parcels
   - Map flies to parcel at zoom 16, saves/restores viewport on back
✅ Side-by-side parcel comparison (checkbox-select 2-4 parcels → Compare)
   - Parcels as columns, attributes as grouped rows
   - Best-value highlighting, "Show differences only" toggle
   - Sticky headers, hover sync between columns and map pins
   - Map fits bounds to compared parcels, dims non-focused pins
✅ ViewMode state management (table | report | compare) in parcel-context
```

## What's Missing

```
❌ Scenario comparison (MIH Option 1 vs Option 2 vs as-of-right)
❌ LL97 coverage check
❌ Export (CSV from table, PDF from report)
❌ Batch address input
❌ Site photo analysis (Gemini multimodal)
❌ URL-based state / deep linking (shareable report/comparison URLs)
❌ Keyboard accessibility improvements
```

---

## Key Architecture Notes for Next Agent

### State Management

State lives in `lib/parcel-context.tsx` using `useReducer`. Key fields:

```typescript
interface ParcelState {
  parcels: PinnedParcel[]
  hoveredBBL: string | null
  sortColumn: SortableColumn | null
  sortDirection: 'asc' | 'desc'
  selectedBBL: string | null       // report view
  compareBBLs: string[]            // comparison view (max 4)
  viewMode: 'table' | 'report' | 'compare'
}
```

Actions: `PIN_PARCEL`, `UPDATE_PROGRESS`, `PARCEL_READY`, `PARCEL_ERROR`, `REMOVE_PARCEL`, `SET_HOVERED`, `SET_SORT`, `CLEAR_ALL`, `SELECT_PARCEL`, `DESELECT_PARCEL`, `TOGGLE_COMPARE`, `CLEAR_COMPARE`, `START_COMPARE`, `SET_VIEW`

### API Route

The agent API is at `apps/web/app/api/parcel/route.ts` (NOT `/api/agent`). It returns `ParcelData` which includes:

```typescript
interface ParcelData {
  // ... all PLUTO/FEMA/DCP fields ...
  interpretation: string
  incentives?: Incentive[]           // AI-structured
  ceqrThresholds?: CEQRThreshold[]   // AI-structured
  estimatedMaxHeight?: string        // AI-structured
}
```

### Component Layout

```
dashboard.tsx → right panel renders based on viewMode:
  ├── viewMode === 'table'   → ComparisonTable + SummaryBar
  ├── viewMode === 'report'  → ParcelReport
  └── viewMode === 'compare' → ParcelComparison
```

### Existing Files (Phase 7)

| Action | Path | Purpose |
| ------ | ---- | ------- |
| Created | `components/parcel-report.tsx` | Full report view with 5 sections |
| Created | `components/parcel-comparison.tsx` | Side-by-side columnar comparison |
| Created | `components/report-section.tsx` | Reusable numbered section wrapper |
| Created | `components/report-data-row.tsx` | Reusable data row with source tag |
| Created | `components/incentive-card.tsx` | Incentive program card |
| Modified | `lib/types.ts` | Added ViewMode, Incentive, CEQRThreshold, new actions |
| Modified | `lib/parcel-context.tsx` | Added reducer cases for report/compare state |
| Modified | `components/dashboard.tsx` | Conditional rendering by viewMode |
| Modified | `components/comparison-table.tsx` | Clickable rows, checkboxes, compare bar |
| Modified | `components/la-map.tsx` | Fly-to, highlight, extent save/restore |
| Modified | `components/parcel-map-layers.ts` | Selected/compared pin styling, dimming |
| Modified | `app/api/parcel/route.ts` | Extended Gemini schema |

---

## Phase 8: Scenario Comparison

### Goal

Add a toggle at the top of the report (parcel-report.tsx) that lets the user compare development scenarios side by side: "What happens if I go MIH Option 1 vs. as-of-right?" This changes the key numbers (FAR, buildable SF, affordability requirement, estimated units) and the agent analysis.

### Prerequisites

- Phase 7 complete (report view functional) ✅

### Design

A toggle bar below the report header with 2-3 scenario tabs:

```
┌──────────────────────────────────────────────────────────┐
│  [As-of-Right]  [MIH Option 1]  [MIH Option 2]          │
│   ▲ active                                               │
└──────────────────────────────────────────────────────────┘
```

Only visible for parcels where `mihArea` is not null (no scenarios needed if MIH doesn't apply).

Each scenario changes:
- Max FAR
- Max Buildable SF
- Affordability requirement (% of units, AMI levels)
- Estimated units (market-rate vs affordable split)
- Agent interpretation

### Implementation Approach

**Recommended: Pre-compute scenarios in the agent API.** Extend `ParcelData` with a `scenarios` array:

```typescript
interface DevelopmentScenario {
  name: string             // "As-of-Right", "MIH Option 1", "MIH Option 2"
  maxFAR: number
  maxBuildableSF: number
  affordabilityReq: string | null  // "25% at 60% AMI" or null
  estimatedUnits: number
  marketRateUnits: number
  affordableUnits: number
  interpretation: string   // Gemini-generated per-scenario
}

// Add to ParcelData:
scenarios?: DevelopmentScenario[]
```

The agent API (`app/api/parcel/route.ts`) would generate 2-3 scenarios when `mihArea` is not null. Use a single Gemini call that generates all scenarios.

### Files to Modify

1. `apps/web/lib/types.ts` — Add `DevelopmentScenario` interface, add `scenarios?` to `ParcelData`
2. `apps/web/app/api/parcel/route.ts` — Extend Gemini schema to generate scenarios when MIH applies
3. `apps/web/components/parcel-report.tsx` — Add scenario toggle bar, conditionally render scenario values

### UI

When user selects a scenario tab, the report re-renders with that scenario's values. The key metrics grid, development potential section, and agent analysis all update. Constraints and existing conditions stay the same (they don't change with scenario).

Use a subtle animation (fade or slide) when switching scenarios.

### Verification

1. Parcel in MIH area → scenario tabs visible
2. Parcel NOT in MIH area → no scenario tabs
3. Click "MIH Option 1" → FAR, buildable SF, interpretation update
4. Click "As-of-Right" → reverts to lower FAR, no affordability requirement
5. Constraint/existing sections don't change between scenarios

---

## Phase 9: Export

### Goal

Enable CSV export from the comparison table and PDF export from the parcel report.

### Prerequisites

- Phase 7 complete ✅

### CSV Export (Table)

Add an "Export CSV" button to the comparison table or summary bar.

```typescript
function handleExportCSV() {
  const headers = ['Address', 'BBL', 'Zoning', 'Lot Area', 'Built FAR', 'Max FAR',
    'FAR Upside', 'Max Buildable SF', 'Score', 'MIH', 'Flood Zone', 'Landmark',
    'E-Designation', 'Interpretation']

  const rows = readyParcels.map(p => [
    p.address, p.bbl, p.data.zoningDistrict, p.data.lotArea,
    p.data.builtFAR, p.data.maxFAR, p.data.farUpside,
    p.data.maxBuildableSF, p.data.score, p.data.mihArea || '',
    p.data.floodZone || '', p.data.landmark || '',
    p.data.eDesigNum || '', p.data.interpretation,
  ])

  const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `sitebrief-comparison-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
```

### PDF Export (Report)

Simplest approach: use the browser's print API with a print-specific stylesheet.

```typescript
function handleExportPDF() {
  window.print()
}
```

Add print styles to hide the map panel, header, and navigation when printing:

```css
@media print {
  .map-panel, header, .back-button, .export-buttons { display: none; }
  .report-panel { width: 100%; }
}
```

### Files to Modify

1. `apps/web/components/comparison-table.tsx` — Add Export CSV button + handler
2. `apps/web/components/parcel-report.tsx` — Add Export PDF button + print styles

### Verification

1. Click Export CSV → downloads .csv with all ready parcels
2. Click Export PDF in report → browser print dialog opens with clean layout

---

## Phase 10: Batch Address Input

### Goal

Allow user to paste multiple addresses at once (from a spreadsheet or list). Each address gets geocoded and analyzed in parallel.

### Prerequisites

- Phases 1-5 complete ✅

### Implementation

Add a "Batch" mode toggle next to the search bar. In batch mode, the input becomes a textarea where users can paste addresses (one per line). On submit, each address is:

1. Geocoded via GeoSearch (sequentially, with 100ms delay to avoid rate limits)
2. Dispatched as `PIN_PARCEL`
3. Analyzed via the agent API (in parallel, max 3 concurrent)

### Files to Modify

1. `apps/web/components/address-search.tsx` — Add batch mode toggle + textarea

### Verification

1. Paste 5 addresses → 5 pins appear on map, 5 rows appear in table
2. Rows populate as each agent call completes (not all at once)
3. Failed geocodes show as skipped (with message)
4. Duplicate addresses are caught

---

## File Index (All Phases)

| Phase | Action | Path |
| ----- | ------ | ---- |
| 1 | Create | `apps/web/.env.example` |
| 1 | Create | `apps/web/lib/types.ts` |
| 1 | Create | `apps/web/lib/format.ts` |
| 1 | Create | `apps/web/lib/zoning.ts` |
| 1 | Create | `apps/web/lib/parcel-context.tsx` |
| 1 | Create | `apps/web/lib/api/geosearch.ts` |
| 2 | Create | `apps/web/components/address-search.tsx` |
| 2 | Create | `apps/web/components/parcel-map-layers.ts` |
| 2 | Create | `apps/web/components/map-tooltip.tsx` |
| 2 | Modify | `apps/web/components/la-map.tsx` |
| 3 | Create | `apps/web/app/api/parcel/route.ts` |
| 4 | Create | `apps/web/components/constraint-tag.tsx` |
| 4 | Create | `apps/web/components/agent-status.tsx` |
| 4 | Create | `apps/web/components/comparison-table.tsx` |
| 4 | Create | `apps/web/components/summary-bar.tsx` |
| 4 | Create | `apps/web/components/dashboard.tsx` |
| 7 | Create | `apps/web/components/parcel-report.tsx` |
| 7 | Create | `apps/web/components/parcel-comparison.tsx` |
| 7 | Create | `apps/web/components/report-section.tsx` |
| 7 | Create | `apps/web/components/report-data-row.tsx` |
| 7 | Create | `apps/web/components/incentive-card.tsx` |
| 7 | Modify | `apps/web/lib/types.ts` (ViewMode, Incentive, CEQRThreshold, new actions) |
| 7 | Modify | `apps/web/lib/parcel-context.tsx` (report/compare reducer cases) |
| 7 | Modify | `apps/web/components/dashboard.tsx` (viewMode switching) |
| 7 | Modify | `apps/web/components/comparison-table.tsx` (clickable rows, checkboxes) |
| 7 | Modify | `apps/web/components/la-map.tsx` (fly-to, extent memory) |
| 7 | Modify | `apps/web/components/parcel-map-layers.ts` (selected/compare styling) |
| 7 | Modify | `apps/web/app/api/parcel/route.ts` (extended Gemini schema) |
| 8 | Modify | `apps/web/lib/types.ts` (DevelopmentScenario) |
| 8 | Modify | `apps/web/app/api/parcel/route.ts` (scenario generation) |
| 8 | Modify | `apps/web/components/parcel-report.tsx` (scenario toggle) |
| 9 | Modify | `apps/web/components/comparison-table.tsx` (CSV export) |
| 9 | Modify | `apps/web/components/parcel-report.tsx` (PDF export + print CSS) |
| 10 | Modify | `apps/web/components/address-search.tsx` (batch mode) |

---

## Priority for Hackathon Demo

If time is limited, build in this order:

1. **Phase 8** (scenario comparison) — The pitch differentiator. "What if MIH Option 1 vs as-of-right?" shows this isn't just a data viewer.
2. **Phase 9 CSV export** — Quick win, 30 minutes of work, makes the table feel like a real tool.
3. **Phase 10 batch input** — Nice-to-have, mention in the pitch as a roadmap feature.

---

## Pre-existing Build Issues

- `apps/web/app/api/chat/route.ts` has a TypeScript error (`maxSteps` not in type) — pre-existing, not related to dashboard work
- `apps/web/lib/agents/property-analyst.ts` has a TS2742 error (inferred type portability) — pre-existing
- Turbopack `next build` fails with `VAR_MODULE_GLOBAL_ERROR` — known Next.js 16 Turbopack bug, `global-error.tsx` has been added but doesn't resolve it. Use `pnpm dev` (dev server works fine).

---

*Continuation of IMPLEMENTATION.md. Phases 1-5 and 7 are complete. Phase 6 was skipped.*
