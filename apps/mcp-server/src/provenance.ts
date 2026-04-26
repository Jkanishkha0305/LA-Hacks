/**
 * Provenance envelope — every tool result is wrapped in one of these so any
 * downstream claim is auditable to the upstream record. This is the core
 * abstraction that distinguishes us from a thin CRUD wrapper.
 */
import { createHash } from "node:crypto"

/** A single upstream data source backing a tool result. */
export interface Source {
  /** Stable identifier for the dataset/endpoint, e.g. "lacity_socrata:2nrs-mtv8". */
  id: string
  /** Final URL (with query params) that produced the data. */
  url: string
  /** ISO-8601 wall-clock at fetch time. */
  fetched_at: string
  /** Human-readable label, e.g. "LAPD Crime Data 2020-Present". */
  label: string
}

/** Provenance metadata stamped onto every tool result. */
export interface Provenance {
  /** Tool that produced this envelope. */
  tool: string
  /** Tool semantic version — bump when output schema changes. */
  tool_version: string
  /** SHA-256 of canonicalized inputs (the cache key). */
  request_hash: string
  /** SHA-256 of the data payload. Identical hash ⇒ identical data. */
  content_hash: string
  /** ISO-8601 of when this result entered the cache. */
  cached_at: string
  /** True if this result was returned from cache (no upstream fetch). */
  cache_hit: boolean
  /** Confidence 0..1. 1.0 for direct upstream fetches, lower for derived/synthetic. */
  confidence: number
  /** Upstream sources contributing to this result. */
  sources: Source[]
  /** Wall-clock latency in ms for the upstream fetch (0 on cache hit). */
  upstream_latency_ms: number
}

export type ToolResult<T> =
  | { ok: true; data: T; provenance: Provenance }
  | { ok: false; error: string; provenance: Provenance }

/** Canonical JSON stringify — sorted keys → deterministic hashes. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`)
    .join(",")}}`
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex")
}

export function hashRequest(tool: string, version: string, input: unknown): string {
  return sha256(`${tool}@${version}:${canonicalize(input)}`)
}

export function hashContent(payload: unknown): string {
  return sha256(canonicalize(payload))
}
