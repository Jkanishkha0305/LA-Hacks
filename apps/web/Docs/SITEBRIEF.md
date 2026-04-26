# SiteBrief — Product & Implementation Spec

> **Pre-design due diligence agent for LA real estate development.**
> Enter an address. Get zoning, incentives, constraints, and development potential — sourced and cited.

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Value Proposition](#2-value-proposition)
3. [Target Users](#3-target-users)
4. [Competitive Landscape](#4-competitive-landscape)
5. [Core Product Concept](#5-core-product-concept)
6. [User Flow (Three Layers)](#6-user-flow-three-layers)
7. [Feature Spec by Layer](#7-feature-spec-by-layer)
8. [Data Architecture](#8-data-architecture)
9. [API Stack](#9-api-stack)
10. [AI Agent Architecture](#10-ai-agent-architecture)
11. [Validation & Trust Strategy](#11-validation--trust-strategy)
12. [UI/UX Design Principles](#12-uiux-design-principles)
13. [Tech Stack](#13-tech-stack)
14. [Hackathon Scope (7-Hour Build)](#14-hackathon-scope-7-hour-build)
15. [Post-Hackathon Roadmap](#15-post-hackathon-roadmap)
16. [Reference Mockups](#16-reference-mockups)
17. [Key Domain Terms](#17-key-domain-terms)

---

## 1. Problem Statement

Evaluating a LA development site requires assembling data from **10+ disconnected city sources** and interpreting how overlapping regulations interact for a specific parcel. These sources include:

- LA Zoning Resolution (thousands of pages of legal text)
- ZoLa / MapPLUTO (parcel-level zoning and lot data)
- Mandatory Inclusionary Housing maps
- Tax incentive programs (485-x, formerly 421-a)
- CEQR environmental review thresholds
- Local Law 97 building emissions caps
- FEMA flood zone maps
- Landmarks Preservation Commission designations
- DOB permits and filings
- City of Yes zoning amendments

Each lives in a **different agency, different format, different update cadence.** A single-parcel analysis takes an experienced professional **4–8 hours.** For acquisitions teams screening 20–30 sites per week, that's a bottleneck that slows deal flow and costs thousands in consultant fees before anyone even knows if a site is worth pursuing.

Tools like LA's **ZoLa** show you *what* rules apply to a parcel — but not *what they mean for your project.* ZoLa is a reference atlas. It tells you you're in R7A. It does **not** tell you:
- Your maximum buildable square footage
- How MIH interacts with your base zoning to unlock bonus FAR
- Whether you're eligible for 485-x tax incentives
- What CEQR reviews your project would trigger
- What the combined effect of all overlapping constraints means for your development strategy

That interpretive gap — from raw data to actionable development brief — is currently filled by a constellation of specialists (zoning attorneys, environmental consultants, architects), each independently researching the same fragmented public data.

---

## 2. Value Proposition

**Turn an address into a development potential briefing in minutes instead of days.**

The agent doesn't replace the zoning attorney or the architect — it gives them (and the developer) a structured, source-cited first pass so the expensive humans spend their time on **judgment and strategy**, not on pulling records from five different city portals.

The shortest version: **ZoLa tells you you're in R7A. SiteBrief tells you what that means for what you can build, what incentives you qualify for, and what regulatory reviews you'll trigger.**

---

## 3. Target Users

### Primary (Hackathon / MVP): Acquisitions Associate at a Developer

The person at a firm like Related Companies, TF Cornerstone, or a smaller 5-10 person development shop. They're screening sites. Their boss says *"find me parcels in Gowanus where we can get 50+ units."*

- **Their workflow today:** ZoLa → MapPLUTO → spreadsheet → call the firm's zoning attorney to gut-check
- **What they need:** Speed and volume. Run 20–30 addresses per week, quickly answer "is this site worth pursuing?"
- **Quality bar:** "Good enough to decide whether to investigate further" — not "good enough to submit to the city"
- **ROI story:** Analyst currently takes 4 hours per site. This takes 2 minutes. At 20 sites/week, that's 80 hours saved weekly.

### Secondary (Post-MVP): Architect / Urban Planner

The person at a firm like HOK, Dattner, Aufgang, or FXCollaborative. A developer client has already picked a site and said "tell me what we can build here."

- **What they need:** Accuracy and completeness. Full regulatory envelope before they start sketching.
- **Quality bar:** Must be trustworthy enough to base a massing study on.
- **Key feature:** Scenario comparison — "what does the building look like under MIH Option 1 vs. as-of-right?"

### Tertiary (Future): Zoning Consultants / Development Consultants

Already know the code inside and out. Won't trust AI to do their job. But might use a tool that accelerates data gathering so they can spend more time on interpretation.

---

## 4. Competitive Landscape

| Company | What They Do | Gap |
|---------|-------------|-----|
| **ZoLa** (LA DCP) | Free map showing zoning districts, overlays, PLUTO data. Reference atlas. | No interpretation. Doesn't tell you what you can build. |
| **Deepblocks** | AI-powered site selection. 16.4M parcels with zoning data. Financial modeling. | Closest competitor. Strong on investment/acquisitions side. Less focused on the LA-specific regulatory stack (MIH + 485-x + CEQR + LL97 as an integrated analysis). |
| **TestFit** | Generative massing / feasibility. Parametric solving engine. | Strong on design/massing. Doesn't aggregate regulatory data or do the interpretive analysis. |
| **Autodesk Forma** | Environmental analysis (sun, wind, daylight, carbon). | Strong on sustainability. No LA-specific zoning, tax incentive, or regulatory data. |
| **Zoneomics** | Zoning data aggregation platform. APIs and reports. | Data layer only. No interpretation or massing. |
| **Gridics** | 3D zoning visualization. Parcel-level development data. | GIS-focused. No agent-based reasoning across multiple regulatory layers. |
| **Tectmind** | LA-specific automated zoning analysis with massing. | Newer entrant. Worth watching. |

### SiteBrief's Differentiation

The **integration layer** that no single existing tool provides: LA zoning + MIH requirements + tax incentive eligibility + CEQR environmental review triggers + LL97 carbon caps + flood zones + landmark constraints → all cross-referenced for a specific parcel → synthesized into a plain-language development brief with source citations.

---

## 5. Core Product Concept

**The product is the report, not the map.** The map serves as a navigation tool for comparing parcels spatially, but the core value is the intelligence briefing generated for each parcel.

The interface supports a **three-layer depth model** that mirrors how acquisitions teams actually work:

```
SCAN (map) → SHORTLIST (table) → DEEP DIVE (report)
```

---

## 6. User Flow (Three Layers)

### Layer 1: Map View — Scan

User defines a target area (draws boundary, selects neighborhood, or enters multiple addresses). The map displays all analyzed parcels, color-coded by development potential score:

- 🟢 **Green:** High potential (large FAR upside, clean constraints)
- 🟡 **Yellow:** Moderate (some upside but with flags)
- 🔴 **Red:** Low potential (minimal FAR upside, major constraints)

The user clicks parcels to select/deselect them for comparison. Hovering shows a mini tooltip with headline metrics.

### Layer 2: Comparison Table — Shortlist

Selected parcels appear in a sortable, scannable table showing the key decision metrics side by side:

- Address / BBL
- Zoning District
- Lot Area
- Current FAR → Max FAR (showing the delta)
- Max Buildable SF
- MIH applicability (yes/no)
- Constraint flags (flood, landmark, E-designation)
- Development potential score

A summary bar at the bottom aggregates across the selection (total buildable SF, average FAR upside, count with constraints). Export to CSV.

### Layer 3: Full Parcel Report — Deep Dive

Clicking a row drills into the detailed intelligence briefing. This is organized by what the user needs to decide, in this order:

1. **Key Metrics Bar** — Zoning, Max FAR, Max Buildable SF, Max Height at a glance
2. **Agent Analysis** — AI-generated synthesis of what this parcel means as a development opportunity. Plain language. Visually separated from factual data.
3. **Development Potential** — FAR (base, overlay, MIH bonus), buildable area, height limits, setbacks, parking. Every value cites its source dataset.
4. **Incentives & Programs** — MIH options, 485-x eligibility, transit zone benefits, other applicable programs. Each with status (Applicable / Potentially Eligible) and impact.
5. **Constraints & Flags** — Flood zone, historic district, landmark, E-designation, Superfund proximity. Green dot = clear, yellow dot = flagged.
6. **Environmental Review (CEQR)** — Which analysis thresholds the project would likely trigger based on estimated scale.
7. **Existing Conditions** — Current building, year built, current FAR used, existing units, owner.
8. **Disclaimer** — Source citations, data freshness, "verify with qualified professionals."

---

## 7. Feature Spec by Layer

### Layer 1: Map Features

- [ ] Mapbox GL JS dark basemap
- [ ] Parcel dots/polygons color-coded by score
- [ ] Hover tooltip (address, buildable SF, FAR, key flag)
- [ ] Click to select/deselect for comparison
- [ ] Legend showing score meanings
- [ ] Parcel count indicator
- [ ] Zoning district boundary overlay (from GIS Zoning Features)
- [ ] Flood zone overlay (from FEMA NFHL)
- [ ] **Future:** Draw boundary to analyze all parcels in area
- [ ] **Future:** Filter controls (min lot area, target use type, exclude flood zones)

### Layer 2: Table Features

- [ ] Sortable columns (click header to sort asc/desc)
- [ ] FAR column shows current → max with delta
- [ ] Constraint flags as color-coded tags (FLOOD, E-DESIG, LPC, CLEAR)
- [ ] Score indicator (dot + label)
- [ ] Click row to open Layer 3
- [ ] Hover row highlights corresponding parcel on map
- [ ] Summary aggregation bar at bottom
- [ ] Export CSV button
- [ ] Select All / Clear buttons

### Layer 3: Report Features

- [ ] Mini map in sidebar showing parcel location
- [ ] Quick stats sidebar (zoning, lot area, existing building, owner)
- [ ] Key metrics grid (FAR, buildable SF, units, height)
- [ ] Agent Analysis block (visually distinct, blue accent)
- [ ] Development Potential section with source-cited data rows
- [ ] Incentives cards with status and impact
- [ ] Constraints list with status dots
- [ ] CEQR threshold analysis
- [ ] Export PDF button
- [ ] Share button
- [ ] Back to map navigation
- [ ] **Future:** Scenario comparison toggle (MIH Option 1 vs Option 2 vs as-of-right)

---

## 8. Data Architecture

### Data per Parcel

The agent assembles the following data model for each parcel:

```typescript
interface ParcelAnalysis {
  // Identifiers
  bbl: string;            // Borough-Block-Lot (10 digits)
  address: string;
  borough: string;
  block: string;
  lot: string;
  lat: number;
  lng: number;

  // Zoning (from PLUTO + GIS Zoning Features)
  zoningDistrict: string;       // e.g. "R7A", "M1-4/R7A"
  commercialOverlay: string | null;  // e.g. "C2-4"
  specialDistrict: string | null;
  mihArea: string | null;       // e.g. "MIH Option 1"
  historicDistrict: string | null;
  landmark: string | null;

  // Lot Data (from PLUTO)
  lotArea: number;              // sq ft
  lotFrontage: number;
  lotDepth: number;
  existingBuilding: string;
  yearBuilt: number;
  existingFAR: number;
  existingUnits: number;
  buildingClass: string;
  owner: string;

  // Development Potential (computed from zoning rules + PLUTO)
  baseFAR: number;
  maxFAR: number;               // with overlay
  mihBonusFAR: number | null;   // with MIH bonus
  maxBuildableSF: number;
  maxHeight: number;            // feet
  maxFloors: number;
  requiredSetbacks: string;
  parkingRequirement: string;
  unusedFAR: number;

  // Constraints (from multiple sources)
  floodZone: string | null;     // e.g. "Zone AE" (from FEMA)
  eDesignation: boolean;        // from PLUTO
  ll97Covered: boolean;         // from DOB LL97 CBL
  superfundProximity: boolean;  // calculated

  // CEQR (computed from project scale estimates + threshold rules)
  ceqrThresholds: {
    name: string;
    triggered: boolean;
    detail: string;
  }[];

  // Incentives (computed from zoning + geography + eligibility rules)
  incentives: {
    name: string;
    status: 'Applicable' | 'Potentially Eligible' | 'Not Applicable';
    detail: string;
    impact: string;
  }[];

  // AI-generated
  interpretation: string;       // Gemini-generated analysis
  score: 'high' | 'med' | 'low';
}
```

### Data Source Mapping

| Field | Source | Access Method |
|-------|--------|--------------|
| BBL, coordinates | LA Geoclient API | REST API (address → BBL) |
| Zoning district, FAR, lot area, building class, year built, units, owner, landmark, E-designation | PLUTO via LA Open Data | Socrata SODA API (by BBL) |
| Zoning district boundaries, special districts, MIH areas, commercial overlays | DCP GIS Zoning Features | Pre-downloaded GeoJSON + point-in-polygon |
| Flood zone | FEMA NFHL | Pre-downloaded GeoJSON or ArcGIS REST |
| LL97 covered buildings | DOB LL97 CBL | Pre-downloaded CSV (by BBL) |
| DOB permits/filings | LA Open Data | Socrata SODA API (by BBL) |
| Development potential (FAR, height, setbacks) | Computed | Zoning rules applied to PLUTO data |
| CEQR thresholds | Computed | Pre-encoded threshold rules |
| Tax incentive eligibility | Computed | Pre-encoded eligibility logic |
| Agent interpretation | Gemini API | AI reasoning over all above data |

---

## 9. API Stack

### Required APIs

| API | Purpose | Auth | Free Tier | Sign-Up Time |
|-----|---------|------|-----------|--------------|
| **LA Geoclient** | Address → BBL + coordinates | Subscription key | Free, unlimited | **Days (approval required) — register NOW** |
| **LA Open Data (Socrata SODA)** | PLUTO parcel data, DOB permits | App token (optional) | 1,000 req/hr with token | Instant |
| **Mapbox GL JS** | Interactive map tiles | Access token | 50,000 map loads/month | Instant |
| **Google Gemini API** | AI reasoning + interpretation | API key | Free tier sufficient | Instant |

### Pre-Downloaded Static Datasets

| Dataset | Source | Format | Purpose |
|---------|--------|--------|---------|
| GIS Zoning Features | DCP Bytes of the Big Apple | Shapefile → GeoJSON | Zoning district boundaries on map |
| MIH Areas | DCP Bytes of the Big Apple | Shapefile → GeoJSON | MIH applicability check |
| FEMA Flood Zones | FEMA NFHL / LA Open Data | GeoJSON | Flood zone check |
| LL97 Covered Buildings | DOB website | CSV | LL97 applicability by BBL |

### Data Conversion Pipeline (Pre-Hackathon Prep)

```bash
# Convert ESRI Shapefiles to GeoJSON (clip to target neighborhood)
ogr2ogr -f GeoJSON -t_srs EPSG:4326 gowanus_zoning.geojson nyzd.shp \
  -clipsrc -73.995 40.672 -73.978 40.688

# Or use mapshaper.org (browser-based, drag and drop)
# Upload .shp → Export as GeoJSON → filter to target area
```

---

## 10. AI Agent Architecture

### Agent Flow

```
User enters address
       ↓
[1] LA Geoclient API → resolves to BBL + lat/lng
       ↓
[2] Socrata PLUTO API → returns 70+ fields for that BBL
       ↓
[3] Point-in-polygon checks against pre-loaded GeoJSON layers:
    - Zoning district boundaries
    - MIH areas
    - Flood zones
    - Historic districts
       ↓
[4] Regulatory logic engine (deterministic):
    - Look up FAR/height/setback rules for this zoning district
    - Check MIH bonus FAR eligibility
    - Check 485-x eligibility rules
    - Evaluate CEQR thresholds based on estimated project scale
    - Check LL97 coverage
       ↓
[5] Gemini reasoning (interpretive):
    - Receives ALL structured data from steps 2-4 as context
    - Receives pre-encoded regulatory knowledge base as system prompt
    - Generates: plain-language interpretation, development score, risk flags
       ↓
[6] Structured output rendered in report UI
```

### Gemini System Prompt Structure

```
You are a LA real estate development analyst. You will receive structured 
data about a specific tax lot including zoning, lot characteristics, 
applicable overlays, incentive eligibility, and constraint flags.

Your job is to synthesize this into a concise development potential 
assessment. Be specific about numbers. Flag risks clearly. Reference 
specific zoning sections when relevant.

CRITICAL RULES:
- Never invent data. Only reference what's provided in the structured input.
- Distinguish between facts (from city data) and your interpretation.
- If something is uncertain, say "verify with zoning counsel."
- Be direct. The reader is a real estate professional, not a layperson.
- Keep the analysis to 3-5 sentences for the summary, more for detailed view.
```

### Regulatory Knowledge Base (Pre-Encoded)

For the hackathon, pre-encode rules for the most common LA residential zoning districts:

- **R6A, R6B, R7A, R7B, R7D, R8A, R8B, R9A, R10** — FAR tables, height limits, quality housing setback rules
- **MX districts (M1-4/R6A, M1-4/R7A, etc.)** — Mixed-use equivalents from Gowanus and similar rezonings
- **Commercial overlays (C1-1 through C2-5)** — How they modify residential districts
- **MIH Options 1, 2, 3** — Affordability requirements and corresponding FAR bonuses
- **CEQR Type II thresholds** — Unit counts and project sizes that trigger specific analyses
- **485-x eligibility** — Geographic, timeline, and affordability requirements

This lives as a structured JSON or markdown file that gets injected into Gemini's context alongside the parcel data.

---

## 11. Validation & Trust Strategy

### Design Principle: Auditable, Not Infallible

The output separates two categories of information with distinct visual treatment:

**Deterministic data** (gray/white text, source tags):
- Lot area, zoning district, FAR, building class, flood zone status
- Comes directly from structured city datasets
- Every data point cites its source dataset and field name
- User can cross-check against ZoLa in seconds

**Interpretive reasoning** (blue accent block, labeled "Agent Analysis"):
- How overlapping constraints interact
- What incentives apply and why
- Development potential assessment
- Explicitly flagged as AI-generated
- Includes "verify with zoning counsel" where appropriate

### Validation Approaches

1. **Source attribution on every claim.** No data point appears without a `[source: PLUTO 25v4]` or `[source: ZR §23-154]` tag.
2. **Cross-validation against ZoLa.** For any given parcel, the base data (zoning district, lot area, building class) must match what ZoLa shows.
3. **Known-answer testing.** Validate against 5-10 well-known LA development sites where the analysis is publicly documented.
4. **Pre-encoded rules over free-form generation.** Regulatory logic uses deterministic decision trees, not LLM improvisation. Gemini reasons *over* structured inputs, it doesn't generate the regulatory data.

---

## 12. UI/UX Design Principles

### Visual Design

- **Theme:** Dark mode (professional, data-dense, matches developer tooling aesthetic)
- **Typography:** Instrument Sans (headings/body) + IBM Plex Mono (data, tags, metrics)
- **Accent color:** `#6b9fff` (blue) for highlights, scores, and agent analysis
- **Score colors:** Green `#22c55e` (high), Yellow `#f59e0b` (moderate), Red `#ef4444` (low)
- **Surface hierarchy:** `#0c0c0e` (bg) → `#141416` (cards) → `#1a1a1e` (nested elements)

### Layout

- **Map + Table split-screen** (Layer 1+2): Map 42% left, table 58% right. Persistent map provides spatial context while scanning the table.
- **Report view** (Layer 3): Sidebar 320px (mini map + quick stats) + main content area (full report). Back button returns to map+table.

### Interaction Principles

- Hovering a parcel on the map highlights the corresponding row in the table, and vice versa.
- Clicking a parcel on the map toggles its selection for comparison.
- Clicking a table row opens the full report.
- Sorting the table re-orders rows but doesn't affect the map.
- Summary bar at the bottom of the table aggregates metrics across selected parcels.

---

## 13. Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | **Next.js 14+ (App Router)** | Hackathon requirement (Vercel). Server components for API calls. |
| Deployment | **Vercel** | Hackathon requirement. Edge functions for API proxying. |
| Map | **Mapbox GL JS** via `react-map-gl` | Industry standard for LA GIS. Dark style support. GeoJSON overlay native. |
| Styling | **Tailwind CSS** | Fast iteration. Consistent with dark theme via custom config. |
| AI | **Google Gemini API** via Vercel AI SDK | Hackathon requirement (Google partnership). Use `gemini-3.1-pro-preview`, `gemini-3.1-flash-lite-preview`, or `gemini-3.1-flash-image-preview`. |
| Data fetching | **Server-side fetch in API routes** | Keep API keys server-side. Proxy LA Open Data + Geoclient calls. |
| Spatial operations | **Turf.js** | Client-side point-in-polygon checks against pre-loaded GeoJSON. |
| State management | **React useState/useReducer** | Simple enough for hackathon scope. No external state library needed. |

---

## 14. Hackathon Scope (7-Hour Build)

### What to Build

- [ ] Address search → BBL resolution (Geoclient API)
- [ ] PLUTO data fetch for a single parcel (Socrata API)
- [ ] Mapbox map with 10-15 pre-scored parcels for one neighborhood (Gowanus)
- [ ] Comparison table with sorting and selection
- [ ] Full parcel report with source-cited data
- [ ] Gemini agent analysis for each parcel
- [ ] Navigation between map/table and report views

### What to Fake / Simplify

- Pre-load parcel data for the demo neighborhood (fallback if API is slow)
- Pre-download and clip GeoJSON layers for Gowanus only
- Score calculation can be simplified (FAR upside * lot area, penalized by constraints)
- Zoning regulatory knowledge base covers only the districts present in Gowanus
- No user auth, no saved sessions, no database

### What to Cut

- No batch address upload
- No draw-to-analyze boundary tool
- No CSV export (button exists, not functional)
- No PDF export
- No scenario comparison
- No massing diagram generation
- No mobile responsiveness

### Hour-by-Hour Plan

| Hour | Task |
|------|------|
| 1 | Scaffold Next.js + Tailwind + Mapbox. Set up API route for Geoclient + PLUTO. Test with one address. |
| 2 | Pre-process Gowanus GeoJSON layers. Build map component with parcel dots. Wire up selection. |
| 3 | Build comparison table component. Connect to map (hover sync, click to select). |
| 4 | Build report view. Wire up PLUTO data → report sections. Source citations. |
| 5 | Integrate Gemini. Build system prompt + regulatory context. Generate interpretations for demo parcels. |
| 6 | Wire all three layers together. Navigation flow. Summary bar. Polish. |
| 7 | Test with real addresses. Fix bugs. Rehearse demo narrative. |

---

## 15. Post-Hackathon Roadmap

### Phase 1: LA Coverage (Months 1-3)
- Expand from one neighborhood to all five boroughs
- Full regulatory knowledge base for all LA zoning districts
- Real-time PLUTO + Geoclient integration (no pre-loaded data)
- Batch address analysis (paste 50 addresses, get ranked table)
- User accounts and saved analyses

### Phase 2: Architect Features (Months 3-6)
- Scenario comparison (MIH Option 1 vs 2 vs as-of-right)
- Programmatic zoning envelope diagram (computed from constraints, not AI-generated)
- Integration with Revit / SketchUp export
- Detailed CEQR screening report

### Phase 3: Platform (Months 6-12)
- Draw-to-analyze: select an area on the map, analyze all parcels within
- Assemblage analysis: identify adjacent parcels that could be combined
- Pro forma integration: connect development potential to financial modeling
- Alert system: notify when zoning changes affect saved parcels
- Multi-city expansion beyond LA

### Multimodal AI Features (Exploratory)
- **Site photo analysis:** User uploads a street photo of the site. Gemini describes existing conditions (building type, approximate height, surrounding context) and incorporates into the analysis.
- **Zoning envelope visualization:** Programmatically computed 3D envelope (from setback/height rules), annotated by Gemini with plain-language explanations. This is geometric computation with AI annotation — NOT AI-generated massing.

---

## 16. Reference Mockups

Two interactive mockups have been built and are included in this repo:

### `mockup.jsx` — V1: Single Parcel Report
- Report-first interface with address search
- Full development potential report with source citations
- Sections: Development Potential, Incentives, Constraints, CEQR, Existing Conditions
- Agent Interpretation block (visually separated)
- Loading state showing data pipeline steps

### `sitebrief-v2.jsx` — V2: Full Three-Layer Flow
- **Layer 1:** Stylized map of Gowanus with 10 parcels, color-coded by score
- **Layer 2:** Sortable comparison table with FAR delta, constraint tags, summary bar
- **Layer 3:** Full report with sidebar (mini map + quick stats) and main content area
- Real navigation between layers (click row → report, back button → map)
- Hover sync between map and table
- Mock data using realistic Gowanus parcel characteristics (MX-8 rezoning, MIH, flood zones, Superfund proximity)

---

## 17. Key Domain Terms

For any developer working on this codebase who isn't familiar with LA real estate:

| Term | Definition |
|------|-----------|
| **BBL** | Borough-Block-Lot. A 10-digit unique identifier for every tax lot in LA. Format: `B-BBBBB-LLLL`. |
| **FAR** | Floor Area Ratio. The ratio of total building floor area to the lot area. FAR of 6.0 on a 10,000 sf lot = 60,000 sf buildable. |
| **MIH** | Mandatory Inclusionary Housing. In designated areas, developers must include affordable units to access full zoning capacity. |
| **485-x** | LA's current tax incentive program for new residential construction with affordable housing (successor to 421-a). |
| **CEQR** | City Environmental Quality Review. LA's environmental review process triggered by discretionary actions. |
| **LL97** | Local Law 97 of 2019. Carbon emission caps for buildings >25,000 sf. |
| **PLUTO** | Primary Land Use Tax Lot Output. LA's comprehensive parcel-level dataset with 70+ fields. |
| **MapPLUTO** | PLUTO merged with lot geometries from the Digital Tax Map. |
| **ZoLa** | Zoning and Land Use Application. LA DCP's public zoning map tool. |
| **Zoning Resolution** | The legal text governing all land use in LA. Thousands of pages. |
| **E-Designation** | Environmental designation requiring DEP review for hazardous materials, air quality, or noise. |
| **Setback** | Required distance between a building and its lot lines, or required step-back at certain heights. |
| **Sky Exposure Plane** | An imaginary inclined plane starting at a certain height above the street, above which a building cannot penetrate. |
| **As-of-Right** | Development that complies with existing zoning without requiring special permits or approvals. |
| **Massing Study** | An early-stage architectural study showing the approximate size and shape of a building on a site. |

---

*Last updated: March 2026*
*Hackathon: Zero to Agent (Vercel x Google)*
