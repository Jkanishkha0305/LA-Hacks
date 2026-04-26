/**
 * Tool runtime: the orchestrator that wraps every tool call with cache lookup,
 * provenance stamping, and journaling. This is where the three pillars meet.
 */
import type { ZodTypeAny, z } from "zod"
import { ProvenanceCache } from "./cache.js"
import { SessionJournal } from "./journal.js"
import {
  hashContent,
  hashRequest,
  type Provenance,
  type Source,
  type ToolResult,
} from "./provenance.js"

export interface ToolContext {
  /** Where to flag upstream sources for the provenance envelope. */
  pushSource: (source: Source) => void
  /** Treat as plain `fetch` but logs upstream URL automatically as a Source. */
  trackedFetch: (input: string | URL, init?: RequestInit & { sourceId?: string; sourceLabel?: string }) => Promise<Response>
}

export interface ToolDefinition<TIn, TOut> {
  name: string
  version: string
  title: string
  description: string
  inputSchema: ZodTypeAny
  /** TTL override in ms. Default 24h. */
  cacheTtlMs?: number
  /** Confidence floor for fresh upstream results. Default 1.0. */
  baseConfidence?: number
  execute: (input: TIn, ctx: ToolContext) => Promise<TOut>
}

export interface RuntimeOptions {
  cache: ProvenanceCache
  journal: SessionJournal
  /** Skip cache reads for this call (always re-fetch). */
  noCache?: boolean
}

/** Type helper to recover the input type from a Zod schema. */
export type Infer<T extends ZodTypeAny> = z.infer<T>

/**
 * Run a tool with full runtime semantics. Returns a `ToolResult<TOut>`
 * envelope ready to be JSON-serialized to MCP `content[].text`.
 */
export async function runTool<TIn, TOut>(
  tool: ToolDefinition<TIn, TOut>,
  rawInput: unknown,
  opts: RuntimeOptions,
): Promise<ToolResult<TOut>> {
  // 1. Validate input — Zod-first contract enforcement.
  const parsed = tool.inputSchema.safeParse(rawInput)
  if (!parsed.success) {
    const provenance: Provenance = {
      tool: tool.name,
      tool_version: tool.version,
      request_hash: hashRequest(tool.name, tool.version, rawInput),
      content_hash: "",
      cached_at: new Date().toISOString(),
      cache_hit: false,
      confidence: 0,
      sources: [],
      upstream_latency_ms: 0,
    }
    const result: ToolResult<TOut> = {
      ok: false,
      error: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      provenance,
    }
    await opts.journal.write(tool.name, rawInput, result)
    return result
  }

  const input = parsed.data as TIn
  const requestHash = hashRequest(tool.name, tool.version, input)

  // 2. Cache lookup unless explicitly bypassed.
  if (!opts.noCache) {
    const hit = await opts.cache.get<TOut>(requestHash)
    if (hit) {
      await opts.journal.write(tool.name, input, hit)
      return hit
    }
  }

  // 3. Cold call. Track sources + latency.
  const sources: Source[] = []
  const startedAt = performance.now()

  const ctx: ToolContext = {
    pushSource: (s) => sources.push(s),
    trackedFetch: async (url, init) => {
      const finalUrl = typeof url === "string" ? url : url.toString()
      const id = init?.sourceId ?? new URL(finalUrl).hostname
      const label = init?.sourceLabel ?? id
      const res = await fetch(finalUrl, init)
      sources.push({
        id,
        url: finalUrl,
        fetched_at: new Date().toISOString(),
        label,
      })
      return res
    },
  }

  let result: ToolResult<TOut>
  try {
    const data = await tool.execute(input, ctx)
    const elapsed = Math.round(performance.now() - startedAt)
    const provenance: Provenance = {
      tool: tool.name,
      tool_version: tool.version,
      request_hash: requestHash,
      content_hash: hashContent(data),
      cached_at: new Date().toISOString(),
      cache_hit: false,
      confidence: tool.baseConfidence ?? 1,
      sources,
      upstream_latency_ms: elapsed,
    }
    result = { ok: true, data, provenance }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const elapsed = Math.round(performance.now() - startedAt)
    const provenance: Provenance = {
      tool: tool.name,
      tool_version: tool.version,
      request_hash: requestHash,
      content_hash: "",
      cached_at: new Date().toISOString(),
      cache_hit: false,
      confidence: 0,
      sources,
      upstream_latency_ms: elapsed,
    }
    result = { ok: false, error: message, provenance }
  }

  // 4. Persist + journal.
  await opts.cache.put(requestHash, result, tool.cacheTtlMs)
  await opts.journal.write(tool.name, input, result)
  return result
}
