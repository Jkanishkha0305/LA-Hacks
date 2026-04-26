# SiteScope MCP

> **A verified, replayable MCP server that turns any AI coding agent into a senior LA real-estate analyst.**

Built for **Cognition's "Augment the Agent"** track at LA Hacks 2026.

---

## The problem

AI coding agents — Devin, Claude, Cursor, Windsurf — can write code, run tests, and open PRs. But when you point them at a knowledge-work domain like real-estate due diligence, three failures happen every time:

1. **They hallucinate facts.** APNs, lot areas, zoning codes — all plausible-looking, all wrong.
2. **They burn tokens re-fetching.** Same parcel, same zip code, same census tract — fetched on every turn.
3. **You can't audit them.** "Did the agent really verify that, or did it guess?" — there's no record, no source chain.

Most MCP servers are CRUD wrappers that make problem 1 worse: more tools, more chances to hallucinate. SiteScope MCP is built differently.

## The three pillars

### 1. Provenance-aware tool layer

Every tool result is wrapped in a signed envelope:

```jsonc
{
  "ok": true,
  "data": { "apn": "5145-016-014", "lotAreaSqft": 7142.3, "zoning": "R3-1" },
  "provenance": {
    "tool": "fetch_parcel",
    "tool_version": "1.0.0",
    "request_hash": "f3a7…",          // SHA-256 of canonicalized inputs
    "content_hash": "9c12…",          // SHA-256 of payload — identical hash ⇒ identical data
    "cached_at": "2026-04-26T10:14:22Z",
    "cache_hit": false,
    "confidence": 1.0,
    "sources": [
      {
        "id": "lacity_socrata:qyra-qm2s",
        "url": "https://data.lacity.org/resource/qyra-qm2s.geojson?$where=…",
        "fetched_at": "2026-04-26T10:14:22Z",
        "label": "LA City Parcels (Socrata)"
      }
    ],
    "upstream_latency_ms": 412
  }
}
```

Any downstream claim is auditable to the upstream record. The agent (and the human reviewer) sees not just the answer, but where it came from.

### 2. Cross-tool consistency verifier — `verify_claim`

The keystone tool. The agent generates a structured claim; we re-fetch independent upstream data and return a verdict + evidence chain.

```jsonc
// Agent says: "the parcel at 34.0522, -118.2437 is 1000 sqft"
{
  "tool": "verify_claim",
  "input": {
    "claim": {
      "type": "lot_area_sqft",
      "subject": { "lat": 34.0522, "lng": -118.2437 },
      "expected": 1000,
      "tolerancePct": 0.05
    }
  }
}

// MCP returns:
{
  "verdict": "contradicted",
  "confidence": 0.9,
  "reasoning": "Lot area 7142 sqft differs from claim 1000 sqft by 614.2% (tolerance 5.0%).",
  "evidence": [{ "tool": "fetch_parcel", "input": {...}, "output": {...}, "sources": [...] }],
  "diff": { "expected": 1000, "actual": 7142.3, "metric": "lot_area_sqft" }
}
```

This is *"better verification for AI-generated code"* applied to AI-generated *answers* — directly hitting Cognition's brief.

Supported claim types:

| Type                | What gets re-fetched              |
|---------------------|-----------------------------------|
| `zoning`            | LA City parcel record             |
| `lot_area_sqft`     | LA City parcel record (± tolerance) |
| `apn`               | LA City parcel record (normalized) |
| `toc_tier`          | LA TOC Tiers ArcGIS layer         |
| `permit_count_min`  | LADBS permits within radius       |
| `address_resolves`  | Geocoder (Google → Census fallback) |

### 3. Deterministic session replay

Every MCP session writes a JSONL journal at `.cache/sessions/<id>.jsonl`. The journal records `step, ts, tool, input, ok, error, provenance` for every call. Combined with the content-addressed cache, **any session is deterministically replayable**.

Read it via the MCP resource:

```
session://current               → current session's journal as JSONL
session://s_abc123_…            → any past session
cache://stats                   → cache size + current session id
```

Use cases:
- **Agent debugging** — "rewind to step 3, change the input, re-run".
- **Regression testing** — pin a journal as a fixture; if outputs drift, the cache surfaces it.
- **Human-AI handoff** — pass a session id to a teammate; they get the agent's full reasoning chain.

## What's in the box

| File                                  | Purpose                                                  |
|---------------------------------------|----------------------------------------------------------|
| `src/index.ts`                        | Stdio entry point — for Claude Desktop/Cursor/Windsurf   |
| `src/http.ts`                         | Streamable HTTP transport — for Devin/remote agents      |
| `src/server.ts`                       | Shared `McpServer` setup, registers tools + resources    |
| `src/runtime.ts`                      | Cache + journal + provenance orchestration               |
| `src/cache.ts`                        | Content-addressed JSON cache, TTL'd, persistent          |
| `src/journal.ts`                      | Append-only JSONL session journal                        |
| `src/provenance.ts`                   | Envelope schema + canonical hashing                      |
| `src/tools/{geocode,parcel,permits,crime,violations,complaints,census,rent,sales,toc-tier,verify-claim}.ts` | 11 typed MCP tools |
| `src/eval/{tasks,run}.ts`             | Empirical eval harness: agent w/ vs w/o MCP              |
| `bin/sitescope-mcp.mjs`               | npx-friendly bin shim                                    |

## Tools exposed

| Tool                    | Inputs                          | What it does                                            |
|-------------------------|---------------------------------|---------------------------------------------------------|
| `geocode_address`       | `address`                       | LA address → lat/lng/BBL/zip (Google → Census fallback) |
| `fetch_parcel`          | `lat, lng`                      | LA City parcel: APN, zoning, lot area                   |
| `fetch_permits`         | `lat, lng, radiusMeters`        | LADBS building permits within radius                    |
| `fetch_crime`           | `lat, lng, radiusMeters, monthsBack` | LAPD crime, Part I/II split, by category           |
| `fetch_violations`      | `address`                       | LAHD housing violations + enforcement cases             |
| `fetch_complaints`      | `lat, lng, radiusMeters`        | MyLA311 service requests                                |
| `fetch_census_income`   | `lat, lng`                      | ACS median household income for census tract            |
| `fetch_fair_market_rent`| `area`                          | HUD FMR by bedroom count                                |
| `fetch_market_context`  | `zipCode, …`                    | LA market tier + $/sqft estimates                       |
| `fetch_toc_tier`        | `lat, lng`                      | LA Transit-Oriented Communities tier (Measure JJJ)      |
| `verify_claim`          | `claim` (discriminated union)   | Cross-tool consistency verifier                         |

## Quickstart

```bash
# From the repo root:
pnpm install
cd apps/mcp-server
cp .env.example .env   # optional — boosts geocoder/Socrata limits

# Stdio transport (for Claude Desktop, Cursor, Windsurf, Devin)
pnpm dev

# Streamable HTTP transport (for remote agents / web hosts)
pnpm http
# → http://localhost:8787/mcp

# Inspector — interactive UI to poke the tools
pnpm inspect

# Eval harness (needs GOOGLE_GENERATIVE_AI_API_KEY)
pnpm eval > eval-scorecard.md
```

## Integration: Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sitescope": {
      "command": "npx",
      "args": ["-y", "tsx", "/abs/path/to/site-scope/apps/mcp-server/src/index.ts"],
      "env": {
        "GOOGLE_MAPS_API_KEY": "…optional…",
        "SOCRATA_APP_TOKEN": "…optional…"
      }
    }
  }
}
```

## Integration: Cursor / Windsurf

Add to your editor's MCP settings (Cursor: Settings → MCP → New Server):

```json
{
  "name": "sitescope",
  "command": "npx",
  "args": ["-y", "tsx", "/abs/path/to/site-scope/apps/mcp-server/src/index.ts"]
}
```

## Integration: Devin / remote agents

Run the HTTP transport:

```bash
pnpm http
```

Devin / any HTTP MCP client connects to `http://your-host:8787/mcp` and follows the standard initialize-then-call flow.

## Integration: Vercel AI SDK (programmatic)

```ts
import { experimental_createMCPClient as createMCPClient } from "ai"
import { Experimental_StdioMCPTransport as StdioMCPTransport } from "ai/mcp-stdio"
import { generateText } from "ai"
import { google } from "@ai-sdk/google"

const mcp = await createMCPClient({
  transport: new StdioMCPTransport({
    command: "npx",
    args: ["-y", "tsx", "apps/mcp-server/src/index.ts"],
  }),
})

const tools = await mcp.tools()

const { text } = await generateText({
  model: google("gemini-2.0-flash"),
  tools,
  prompt: "What is the parcel APN and zoning at 350 S Grand Ave, Los Angeles?",
})

await mcp.close()
```

## Why this is different

| Most MCP servers                              | SiteScope MCP                                        |
|-----------------------------------------------|------------------------------------------------------|
| Thin wrapper around an API                    | Provenance envelope on every result                  |
| No caching — re-fetch every turn              | Content-addressed cache, TTL'd, persistent           |
| No way to verify an agent's claim             | `verify_claim` cross-tool consistency check          |
| No replay — sessions are ephemeral            | JSONL journals, deterministically replayable         |
| One transport                                 | Stdio + Streamable HTTP                              |
| Hand-rolled fetch logic                       | Zod-validated I/O, source tracking, latency metrics  |

## Eval results (illustrative)

After running `pnpm eval`, you get a markdown scorecard like:

```
| Task            | Arm      | Score          | Tool calls | Latency |
|-----------------|----------|----------------|-----------:|--------:|
| T01-grand-park  | baseline | 1/4 (25%)      |          0 |  1382ms |
| T01-grand-park  | mcp      | 4/4 (100%)     |          3 |  4810ms |
| T06-cross-tool  | baseline | 1/3 (33%)      |          0 |   974ms |
| T06-cross-tool  | mcp      | 3/3 (100%)     |          5 |  6122ms |
| T07-verify      | baseline | 0/3 (0%)       |          0 |  1024ms |
| T07-verify      | mcp      | 3/3 (100%)     |          2 |  3344ms |

## Summary
- Baseline avg accuracy: 19.5%
- MCP avg accuracy:      94.3%
- Δ accuracy:            +74.8 pts
- Total MCP tool calls:  18
```

## License

MIT — built for LA Hacks 2026. Author: SiteScope team.
