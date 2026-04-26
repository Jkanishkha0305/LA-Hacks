# SiteScope — LA Real Estate Due Diligence, In Seconds

> Type any LA street address. Get a Bloomberg-grade development brief — zoning, FAR, TOC tier, fire & fault hazards, permits, violations, market rent, crime, demographics — in under 60 seconds. Powered by 9+ live LA public data APIs and a Gemini-driven agent.

**LA Hacks 2026 submission.** Built in 36 hours.

---

## What this is

LA real estate due diligence today: 2-3 days of an associate clicking through ZIMAS, NavigateLA, LAHD, LADBS, and 6 more portals, copy-pasting numbers into Excel, and writing a memo nobody reads.

SiteScope collapses that into a single workflow:

1. Click the map (or type the address)
2. The agent fetches 9 live data sources in parallel
3. Gemini 3.1 Flash Lite synthesizes a 4-section development potential brief
4. The whole UI is data-dense, dark-mode, keyboard-driven — built for power users who already know what FAR means

The same backend is exposed three ways:
- **Web app** at `apps/web` (Next.js 16 + deck.gl + react-map-gl)
- **MCP server** at `apps/mcp-server` (provenance-aware tools for any AI coding agent)
- **Agentverse / ASI:One agent** at `agentverse/` (uagents Chat Protocol)

---

## Architecture

```
                     ┌──────────────────────────────┐
                     │    LA Public Data Sources    │
                     │  (LA County Assessor, LADBS, │
                     │   LAHD, MyLA311, LAPD,       │
                     │   ArcGIS layers, Census ACS, │
                     │   HUD FMR, Google Geocoding) │
                     └──────────────┬───────────────┘
                                    │
            ┌───────────────────────┼─────────────────────────┐
            │                       │                         │
            ▼                       ▼                         ▼
    ┌──────────────┐       ┌────────────────┐       ┌─────────────────┐
    │  Web app     │       │  MCP server    │       │  Agentverse     │
    │  (Next.js)   │       │  (TypeScript)  │       │  (Python uagent)│
    │              │       │                │       │                 │
    │  Map + chat  │       │  11 typed      │       │  Chat Protocol  │
    │  + analysis  │       │  tools, Zod    │       │  proxy → web    │
    │  panel       │       │  I/O, JSONL    │       │  backend        │
    │              │       │  replay journal│       │                 │
    └──────┬───────┘       └────────────────┘       └────────┬────────┘
           │                                                  │
           │                  used by                used by  │
           │         Claude Desktop / Cursor /               │
           │           Windsurf / Devin                  ASI:One users
           ▼
    ┌──────────────────────────────────┐
    │  MongoDB Atlas (analysis cache)  │
    │  Auth0 (login)                   │
    └──────────────────────────────────┘
```

**Three deliverables, one shared agent core.** The Next.js app at `apps/web` runs the Gemini ToolLoop and owns all the LA data fetchers. The MCP server is an independent re-implementation focused on agent verification (provenance + replay). The Python uagent is a thin proxy that exposes the web backend to ASI:One.

---

## What's in the repo

| Path | What it is |
|---|---|
| `apps/web` | Next.js 16 app — interactive map, chat overlay, parcel analysis panel, report generator, recent searches, Auth0 login. |
| `apps/web/app/api/parcel/route.ts` | Deterministic parcel pipeline: parallel fetch of 9 data sources, FAR/scenario computation, Gemini-generated interpretation. |
| `apps/web/app/api/chat/route.ts` | Conversational analyst — Gemini 3.1 Flash Lite agent with parcel context, MongoDB-cached responses. |
| `apps/web/app/api/agent/route.ts` | Plain-markdown endpoint consumed by the Python uagent. |
| `apps/web/lib/db/analysis-cache.ts` | MongoDB Atlas cache for completed analyses. |
| `apps/mcp-server` | Standalone MCP server — 11 tools, content-addressed cache, signed provenance envelopes, `verify_claim` cross-tool consistency check, deterministic JSONL replay. |
| `agentverse/agent.py` | Fetch.ai uagents Chat Protocol agent. Mailbox-enabled, ASI:One discoverable. |
| `packages/ui` | Shared shadcn/ui components. |
| `LA_DATA_MAPPING.md` | Source-by-source mapping of every field used in the analyzer. |
| `CLAUDE.md` | Design system + brand voice — Bloomberg terminal × Linear × Vercel. |

---

## Data sources wired up

| Source | What we read | Used for |
|---|---|---|
| LA County Assessor (ArcGIS) | APN, lot area, building SF, year built, use type, valuation | Parcel facts, Built FAR |
| LA City Zoning (Socrata) | Zoning district code | FAR ceiling, height district |
| LA TOC Tiers (ArcGIS) | Transit-Oriented Communities tier 1-4 | Density bonus eligibility |
| Fire Hazard Severity Zones (ArcGIS) | Very High Fire Hazard polygons | Insurance + Title 25 review |
| Alquist-Priolo Fault Zones (ArcGIS) | Active fault zones | Geotech review |
| Liquefaction + Landslide (ArcGIS) | Seismic hazards | Soils review |
| HPOZ (ArcGIS) | Historic Preservation Overlay Zones | Landmark constraints |
| LADBS Permits (ArcGIS) | 100m radius permits, type/date/status | Development activity |
| LAHD Violations (Socrata) | Open enforcement cases | Compliance risk |
| MyLA311 (Socrata 2026 dataset) | 365-day complaint volume by category | Neighborhood health |
| LAPD Crime (Socrata) | 2yr Part I/II crime within 304m | Safety profile |
| Census ACS via FCC FIPS | Median household income for tract | Demographics |
| HUD Fair Market Rent | FMR by bedroom for the LA metro | Rent comps |
| Google Geocoding (+ Census fallback) | Address → lat/lng/zip | Entry point |

All fetchers run in parallel with timeouts. Failures degrade gracefully — partial data still produces a useful brief.

---

## Stack

- **Frontend:** Next.js 16 (App Router, Turbopack), React 19, deck.gl + react-map-gl for the map, shadcn/ui + TailwindCSS, Inter / Geist Mono.
- **Agent:** Vercel AI SDK 6, Gemini 3.1 Flash Lite (cheap + fast for the conversational layer), Gemini 2.5 Pro for the structured parcel analysis.
- **Backend:** Next.js route handlers (serverless on Vercel), 30s `maxDuration` for the parcel pipeline.
- **Data:** MongoDB Atlas for cached analyses, content-addressed JSON cache in the MCP server.
- **Auth:** Auth0 (`@auth0/nextjs-auth0`).
- **Agent platform:** Fetch.ai `uagents` 0.22.x with the canonical Chat Protocol.
- **MCP:** `@modelcontextprotocol/sdk` with stdio + Streamable HTTP transports.
- **Monorepo:** pnpm workspaces + Turbo.

---

## What we shipped

- **Live interactive map** — click any LA parcel, see the boundaries, layers (zoning, fire hazard, TOC, fault zones, transit) toggleable on the right rail.
- **Chat overlay** — keyboard `C` to toggle. Ask follow-up questions about any pinned parcel; the agent has full parcel context and 9 tools at its disposal.
- **Parcel analysis panel** — built FAR, max FAR, FAR upside, max buildable SF, score, AI interpretation, incentive programs, environmental thresholds, TOC scenarios with affordability math.
- **Report generation** — turns the panel into a printable due-diligence memo.
- **Recent searches** — server-side history with Auth0 user scoping.
- **MongoDB caching** — first-message analyses are cached per BBL; subsequent loads return instantly.
- **MCP server** — verified, replayable, provenance-tracking. 11 tools. Stdio + HTTP. Built specifically for the Cognition challenge.
- **Agentverse agent** — Chat Protocol, mailbox-enabled, ready for ASI:One discovery.
- **Lazy MongoDB / graceful env degradation** — the app boots without `MONGODB_URI`; cache silently no-ops instead of crashing.
- **Smart parcel matching** — when LA County returns multiple parcels for one address (common downtown), we pick the most-improved one (real building > parking lot).
- **Dedupe + stable callbacks** — chat geocode results fire `onGeocode` exactly once, even with streaming updates.

---

## LA Hacks 2026 — challenges we're submitting to

### 1. Fetch.ai — Agentverse Search & Discovery of Agents
**Why we fit:** `agentverse/agent.py` is a fully-implemented uagents Chat Protocol agent that wraps our LA real estate analyst. It's mailbox-enabled, manifest-published, and discoverable on Agentverse. From ASI:One you can type *"Analyze 350 S Grand Ave, Los Angeles"* and our agent does the full 20-tool ToolLoop and returns a development brief. Real user intent → real executable outcome.

### 2. Cognition — Augment the Agent
**Why we fit:** `apps/mcp-server` was built specifically for this brief. It targets two of Cognition's listed directions head-on:
- **Better verification for AI-generated answers.** `verify_claim` re-fetches independent upstream data and returns `{verdict, confidence, evidence chain, diff}`. Catches the "agent confidently states a wrong APN" failure mode every other MCP server enables.
- **Agent plugins.** 11 typed MCP tools that connect any agent (Devin, Claude, Cursor, Windsurf) to LA's public real-estate data, with content-addressed caching to stop wasting tokens on re-fetches and JSONL session journals for deterministic replay.

### 3. Arista Networks — Connect the Dots
**Why we fit:** SiteScope is literally a unified dashboard that pulls 14 distinct LA public APIs and routes them into a single decision-grade view for a real-world problem (acquisitions due diligence). It connects fragmented public data into something an actual professional uses to do their job.

### 4. Figma — Flicker to Flow
**Why we fit:** The whole pitch is friction → function. A workflow that took an associate 2-3 days now takes 60 seconds. Power-user dense UI, keyboard shortcuts, instant feedback — designed to keep someone in flow state through a full diligence cycle instead of context-switching across 10 portals.

### 5. MLH × MongoDB — Best Use of MongoDB Atlas
**Why we fit:** MongoDB Atlas powers our analysis cache. First chat on a known parcel triggers a cache lookup; cache writes happen via the AI SDK `onFinish` callback after the agent stream completes. Lazy connection so missing `MONGODB_URI` degrades gracefully to no-cache mode instead of crashing.

### 6. MLH × Vultr — Best Use of Vultr (if we deploy)
**Why we fit:** The Next.js app + MCP HTTP server + Python uagent all run on cloud compute. Easy to redeploy on Vultr.

---

## Quickstart

```bash
# 1. Install
pnpm install

# 2. Configure (apps/web/.env)
cp apps/web/.env.example apps/web/.env
# Required: GOOGLE_GENERATIVE_AI_API_KEY (or GEMINI_API_KEY)
# Optional: MONGODB_URI, AUTH0_*, GOOGLE_MAPS_API_KEY, SOCRATA_APP_TOKEN

# 3. Run the web app
pnpm --filter web dev
# → http://localhost:3000
```

### Run the MCP server (for Cognition)

```bash
cd apps/mcp-server
cp .env.example .env
pnpm dev          # stdio for Claude Desktop / Cursor / Windsurf
pnpm http         # HTTP transport on :8787 for Devin
pnpm inspect      # interactive inspector
pnpm eval         # baseline-vs-MCP scorecard
```

See `apps/mcp-server/README.md` for the full Cognition writeup with sample provenance envelopes, integration snippets, and eval results.

### Run the Agentverse agent (for Fetch.ai)

```bash
cd agentverse
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # set AGENT_SEED to a stable random string
python agent.py
```

Register the printed agent address on https://agentverse.ai/ and chat with it from https://asi1.ai/. Full instructions in `agentverse/README.md`.

---

## Demo addresses

These exercise different paths through the analyzer:

- `350 S Grand Ave, Los Angeles` — Bunker Hill, commercial high-density, TOC Tier 4
- `633 W 5th St, Los Angeles` — Pacific Mutual area, ~1.3M SF office tower (verifies our multi-parcel matching logic)
- `15000 W Sunset Blvd, Pacific Palisades` — Very High Fire Hazard Zone
- `200 N Spring St, Los Angeles` — Civic Center, public use
- `1234 Wilshire Blvd, Los Angeles` — mid-Wilshire commercial

---

## What we deliberately did not build

- No PDF export of the report (the print stylesheet is sufficient for the demo).
- No multi-tenant data isolation in MongoDB (single-tenant cache by BBL).
- No on-chain payments via Fetch.ai Payment Protocol (optional per the brief).
- No mobile-first layout (the workflow is desktop power-user; phones are a v2 problem).
- No re-implementation of the LA data tools in Python — the Agentverse agent proxies the existing TypeScript implementation. Right tradeoff for a 36-hour build.

---

## License

MIT. Built for LA Hacks 2026.
