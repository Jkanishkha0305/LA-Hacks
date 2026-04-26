# Data Ingestion Layer — AI Agent + Gemini + Supabase

## Context

LA.agent is a Next.js 16 + DeckGL map app with zero backend. The goal is to build an **AI agent** that:

1. **Fetches** LA property data from ~12 public APIs using tools
2. **Ingests city planning PDFs** (City of Yes zoning reports per community district) via Gemini multimodal — these are **system reference data**, not user uploads
3. **Evaluates parcels** with AI reasoning — the agent decides what data to gather, cross-references with zoning rules, and produces a structured assessment

**Stack**: Vercel AI SDK (`ai` + `@ai-sdk/google`) → Gemini 3.1 Pro Preview → tool-calling agent loop → Supabase cache

---

## Architecture

```
User: "Analyze 120 Broadway"
          ↓
    streamText + tools
    model: gemini-3.1-pro-preview
          ↓
    Agent tool calls:
      ├─ geocodeAddress("120 Broadway") → BBL, coords, community district
      ├─ fetchPlutoData(bbl) → building class, units, year, FAR
      ├─ fetchZoningRules(communityDistrict) → City of Yes rules (pre-populated in Supabase)
      ├─ fetchViolations(bbl) → DOB + HPD violations
      ├─ fetchPermits(bbl) → open permits
      ├─ fetchComplaints(bbl) → HPD complaints
      ├─ fetchSalesComps(bbl) → ACRIS + rolling sales
      ├─ fetchRentData(zip) → HUD FMR
      ├─ fetchSubwayProximity(lat, lng) → nearest stations
      ├─ fetchCrimeData(lat, lng) → crime summary
      └─ fetchCensusData(lat, lng) → median income
          ↓
    Agent synthesizes all data + zoning context
          ↓
    Structured output: PropertyEvaluation
          ↓
    Cache in Supabase + stream to frontend
```

The **agent decides** what to fetch. If user asks "just check violations", it only calls that tool. The zoning rules tool gives the agent City of Yes context (ADU eligibility, TOD areas, height bonuses) that informs the evaluation.

**Note**: `community_district_rules` table is pre-populated separately (PDF pre-processing handled outside this plan). The schema and tool are included here so the agent can query them.

---

## Data Sources (unchanged)

| Source | Socrata ID / URL | Key Data | Cache TTL |
|--------|-----------------|----------|-----------|
| GeoSearch | `geosearch.planninglabs.la/v2/search` | Address → BBL, coords | n/a |
| PLUTO | verify at implementation | Building class, units, year, FAR, zoning | 30d |
| Zoning Tax Lot | `fdkv-4t4z` | Zoning district, FAR, overlays | 30d |
| DOB Violations | `ibzj-phrd` | Violation type, date, status | 24h |
| HPD Violations | `csn4-vhvf` | Class A/B/C, status, description | 24h |
| DOB Permits | `ipu4-2q9a` | Permit type, status, cost | 24h |
| HPD Complaints | `cewg-5fre` | Complaint type, status, date | 24h |
| ACRIS Sales | `bnx9-e6tj` | Sale price, date, parties | 7d |
| Rolling Sales | `usep-8jbt` | Recent 12mo sales, price/sqft | 7d |
| HUD FMR | `huduser.gov/hudapi/public/fmr` | Fair market rents by bedroom | 90d |
| MTA Stations | PostGIS in Supabase (pre-loaded) | Station lat/lng, lines | 365d |
| NYPD Complaints | `5uac-w243` | Crime counts by type | 7d |
| Census ACS | `api.census.gov` | Median income by tract | 90d |

---

## File Structure

```
apps/web/
  app/api/
    chat/route.ts                # POST — streamText endpoint for useChat
    geocode/route.ts             # GET — standalone geocode (for map autocomplete)
  lib/
    agents/
      property-analyst.ts        # Agent definition: model, system prompt, tools, output schema
    tools/
      geocode.ts                 # tool(): address → BBL + coords + community district
      pluto.ts                   # tool(): BBL → building data
      zoning-rules.ts            # tool(): community district → City of Yes rules (from pre-processed PDFs)
      violations.ts              # tool(): BBL → DOB + HPD violations
      permits.ts                 # tool(): BBL → open permits
      complaints.ts              # tool(): BBL → HPD complaints
      sales.ts                   # tool(): BBL → ACRIS + rolling sales comps
      rent.ts                    # tool(): zip → HUD FMR data
      subway.ts                  # tool(): lat/lng → nearest stations (PostGIS)
      crime.ts                   # tool(): lat/lng → crime summary
      census.ts                  # tool(): lat/lng → median income
    api/
      socrata.ts                 # Generic Socrata client (SoQL, pagination, rate limit)
      geosearch.ts               # GeoSearch HTTP wrapper
      census.ts                  # Census ACS HTTP wrapper
      hud.ts                     # HUD FMR HTTP wrapper
    supabase/
      client.ts                  # Server-side Supabase client
      schema.sql                 # Reference SQL
    types/
      property.ts                # Domain types + PropertyEvaluation output schema
      api-responses.ts           # Raw API response shapes
    config/
      data-sources.ts            # Endpoint URLs, Socrata IDs, cache TTLs
    utils/
      rate-limiter.ts            # Token bucket for Socrata (900 req/hr)
      cache.ts                   # Generic cache-check + upsert helper
```

---

## AI Agent Design

### Agent Definition (`lib/agents/property-analyst.ts`)

```typescript
import { streamText, tool, stopWhen, stepCountIs } from "ai"
import { google } from "@ai-sdk/google"
import { z } from "zod"
// import all tools...

export const propertyAnalystTools = {
  geocodeAddress,
  fetchPlutoData,
  fetchZoningRules, // City of Yes pre-processed data
  fetchViolations,
  fetchPermits,
  fetchComplaints,
  fetchSalesComps,
  fetchRentData,
  fetchSubwayProximity,
  fetchCrimeData,
  fetchCensusData,
}

export const SYSTEM_PROMPT = `You are a LA real estate analyst agent.
When given an address (or BBL), systematically gather property data using your tools:
1. Geocode the address to get BBL, coordinates, and community district
2. Fetch property fundamentals (PLUTO data)
3. Fetch City of Yes zoning rules for this community district — includes
   TOD eligibility, town center zoning, ADU rules, parking mandates,
   UAP density bonuses, and office conversion eligibility
4. Assess risk (violations, complaints, permits)
5. Pull market data (sales comps, rent)
6. Check location context (subway, crime, income)

When evaluating development potential, cross-reference the property's
current zoning with City of Yes changes for this district. Flag:
- ADU eligibility (owner-occupied 1-2 family, flood/historic restrictions)
- TOD eligibility (near transit, lot size, street width)
- UAP density bonus availability
- Parking mandate changes

After gathering all data, provide a structured evaluation with:
- Property summary + zoning context
- Risk assessment (low/medium/high) with reasoning
- Market position (comps analysis)
- Development potential under City of Yes
- Investment considerations`

export const propertyEvaluationSchema = z.object({
  property: z.object({ bbl: z.string(), address: z.string(), borough: z.string() }),
  fundamentals: z.object({
    buildingClass: z.string().nullable(),
    totalUnits: z.number().nullable(),
    yearBuilt: z.number().nullable(),
    zoning: z.string().nullable(),
    far: z.number().nullable(),
  }),
  risk: z.object({
    level: z.enum(["low", "medium", "high"]),
    dobViolations: z.number(),
    hpdViolations: z.number(),
    openPermits: z.number(),
    complaints: z.number(),
    reasoning: z.string(),
  }),
  market: z.object({
    avgPricePerSqft: z.number().nullable(),
    recentSales: z.number(),
    fmrRange: z.string().nullable(),
    rentStabilized: z.boolean().nullable(),
  }),
  location: z.object({
    nearestSubway: z.string().nullable(),
    subwayDistanceFt: z.number().nullable(),
    medianIncome: z.number().nullable(),
    crimeLevel: z.enum(["low", "moderate", "high"]).nullable(),
  }),
  evaluation: z.string(), // AI's written assessment
})
```

### Tool Pattern (each tool in `lib/tools/`)

```typescript
import { tool } from "ai"
import { z } from "zod"
import { socrataQuery } from "@/lib/api/socrata"
import { supabase } from "@/lib/supabase/client"
import { DATA_SOURCES } from "@/lib/config/data-sources"

export const fetchViolations = tool({
  description: "Fetch DOB and HPD violations for a LA property by BBL. Returns violation counts, types, and severity classes.",
  inputSchema: z.object({
    bbl: z.string().describe("10-digit Borough-Block-Lot identifier"),
  }),
  execute: async ({ bbl }) => {
    // 1. Check Supabase cache
    // 2. If stale: query Socrata for DOB (ibzj-phrd) + HPD (csn4-vhvf)
    // 3. Upsert into Supabase
    // 4. Return structured result for agent to reason about
  },
})
```

Each tool handles its own caching internally. The agent never sees cache logic — it just calls tools and gets data back.

### Zoning Rules Tool (queries pre-populated `community_district_rules`)

The `community_district_rules` table is populated separately via PDF pre-processing (not in this plan).
At query time, the tool simply queries Supabase:
```typescript
export const fetchZoningRules = tool({
  description: "Fetch City of Yes zoning rules for a LA community district. Returns TOD eligibility, town center zoning, ADU restrictions, parking rules, and UAP density bonuses.",
  inputSchema: z.object({
    communityDistrict: z.string().describe("Community district code, e.g. 'MN01' for Manhattan CD 01"),
  }),
  execute: async ({ communityDistrict }) => {
    const { data } = await supabase
      .from("community_district_rules")
      .select("*")
      .eq("district_code", communityDistrict)
      .single()
    return data
  },
})

### API Route (`app/api/chat/route.ts`)

```typescript
import { streamText } from "ai"
import { google } from "@ai-sdk/google"
import { propertyAnalystTools, SYSTEM_PROMPT } from "@/lib/agents/property-analyst"

export async function POST(req: Request) {
  const { messages } = await req.json()

  const result = streamText({
    model: google("gemini-3.1-pro-preview"),
    system: SYSTEM_PROMPT,
    messages,
    tools: propertyAnalystTools,
    stopWhen: stepCountIs(10),
    toolChoice: "auto",
  })

  return result.toUIMessageStreamResponse()
}
```

### Frontend Integration

```typescript
// In sidebar or chat component
import { useChat } from "@ai-sdk/react"

const { messages, input, handleSubmit, uiMessages } = useChat({
  api: "/api/chat",
})
```

The agent streams its reasoning + tool calls to the UI. Frontend can render:
- Tool call indicators ("Fetching violations...")
- Intermediate data as it arrives
- Final structured evaluation

---

## Supabase Schema

All property data tables (BBL FK, `fetched_at` for cache): properties, pluto, zoning, dob_violations, hpd_violations, dob_permits, hpd_complaints, sales, rent_data, subway_stations, crime_summary, census_data.

**New tables for agent + PDF pre-processing:**

**`community_district_rules`** — pre-processed City of Yes zoning rules per district
- `district_code` text PK (e.g. "MN01"), `borough` text, `district_number` smallint
- `tod` JSONB — { applicable: bool, maxHeights: {area: ft}[], qualifyingCriteria: string }
- `town_center` JSONB — { applicable: bool, maxHeights: {area: ft}[], greaterTransitZone: bool }
- `adu` JSONB — { allowed: bool, restrictions: string[], floodZoneRestriction: bool, historicRestriction: bool }
- `parking` JSONB — { zone: 1|2|3, exemptions: string[], mandateRemoved: bool }
- `uap` JSONB — { eligible: bool, bonusFar: number, affordabilityRequirement: string }
- `office_conversion` JSONB — { eligible: bool, buildingAge: string }
- `district_modifications` text — Council-specific modifications
- `source_pdf` text, `processed_at` timestamptz, `model` text

**`evaluations`** — stores agent evaluation results
- id UUID PK, bbl text, evaluation_json JSONB, model text, created_at
- Lets us show past evaluations without re-running the agent

---

## Env Variables

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=   # For Gemini 3.1 Pro Preview
SOCRATA_APP_TOKEN=               # Free: LA Open Data registration
CENSUS_API_KEY=                  # Free: api.census.gov
HUD_API_TOKEN=                   # Free: huduser.gov
```

---

## Implementation Sequence

### Phase 1: Foundation
- [ ] `pnpm add ai @ai-sdk/google @ai-sdk/react @supabase/supabase-js zod` in apps/web
- [ ] Create `.env.local` with all API keys
- [ ] `lib/supabase/client.ts`
- [ ] `lib/types/property.ts` — domain types + Zod schemas (including communityDistrictRulesSchema)
- [ ] `lib/config/data-sources.ts` — endpoints, IDs, TTLs
- [ ] Run `schema.sql` in Supabase SQL editor (including `community_district_rules` table)
- [ ] Verify: `pnpm typecheck` passes

### Phase 2: API Clients + Cache Utils
- [ ] `lib/api/geosearch.ts`
- [ ] `lib/api/socrata.ts` + `lib/utils/rate-limiter.ts`
- [ ] `lib/api/hud.ts` + `lib/api/census.ts`
- [ ] `lib/utils/cache.ts` — generic check-cache / upsert helper
- [ ] `app/api/geocode/route.ts` (standalone for map autocomplete)
- [ ] **Verify**: geocode "120 Broadway" → BBL

### Phase 4: Agent Tools (parallelizable)
- [ ] `lib/tools/geocode.ts`
- [ ] `lib/tools/pluto.ts`
- [ ] `lib/tools/zoning-rules.ts` — queries community_district_rules from Supabase
- [ ] `lib/tools/violations.ts`
- [ ] `lib/tools/permits.ts`
- [ ] `lib/tools/complaints.ts`
- [ ] `lib/tools/sales.ts`
- [ ] `lib/tools/rent.ts`
- [ ] `lib/tools/subway.ts`
- [ ] `lib/tools/crime.ts`
- [ ] `lib/tools/census.ts`

### Phase 5: Agent + Chat Route
- [ ] `lib/agents/property-analyst.ts` — agent definition, system prompt, output schema
- [ ] `app/api/chat/route.ts` — streamText endpoint
- [ ] **Verify**: POST to /api/chat → agent calls tools including zoning rules, streams evaluation

### Phase 6: Frontend Chat Integration (separate plan)
- [ ] Chat interface in sidebar using `useChat`
- [ ] Tool call UI indicators
- [ ] Structured evaluation display with zoning context
- [ ] Property marker on DeckGL map from geocode results

---

## Verification

1. **Geocoding**: `curl localhost:3000/api/geocode?address=120+Broadway` → BBL + community district
3. **Agent chat**: POST `/api/chat` with "Analyze 120 Broadway" → agent calls geocode, pluto, zoning-rules, violations, etc. → streams evaluation
4. **Zoning context**: Agent evaluation mentions City of Yes rules (ADU eligibility, TOD, parking zone) from pre-processed PDF data
5. **Caching**: Second request for same BBL → tools return cached data instantly
6. **Graceful degradation**: Bad Socrata token → agent notes failed tools, still evaluates with available data

## Decisions Made

- **PLUTO**: Socrata API on-demand per BBL
- **Radius**: Fixed — 0.5mi comps, 1000ft crime
- **MTA Stations**: Pre-loaded in Supabase PostGIS
- **Supabase**: Project exists, keys ready
- **AI Model**: Gemini 3.1 Pro Preview via `@ai-sdk/google`
- **Agent pattern**: `streamText` + tools + `stopWhen: stepCountIs(10)`
- **PDF ingestion**: Handled separately; `community_district_rules` table + `fetchZoningRules` tool included for query-time access
- **Frontend**: `useChat` from `@ai-sdk/react`

## AI SDK Conventions (from project skills)

Per the ai-sdk skill references — critical to follow:
- Use `inputSchema` not `parameters` in tool definitions
- Use `stopWhen: stepCountIs(n)` not `maxSteps`
- Use `maxOutputTokens` not `maxTokens`
- Use `toUIMessageStreamResponse()` not `toDataStreamResponse()`
- Check `node_modules/ai/docs/` for current API if unsure
- Install `ai` first, then provider packages
- Fetch model IDs from AI Gateway before hardcoding

## Remaining Open Questions

1. **PLUTO Socrata ID** — verify current ID at implementation time
2. **ACRIS → BBL join** — need ACRIS Legals dataset to map documents to BBLs
