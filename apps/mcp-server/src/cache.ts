/**
 * Content-addressed cache. JSON file backed, in-memory hot.
 *
 * Why this matters: agents repeatedly call the same tools with the same inputs
 * (e.g. while exploring a parcel). Cache hits = faster + cheaper + reproducible.
 * Combined with the provenance envelope, every cached read still carries the
 * original sources/timestamps so the agent's reasoning remains auditable.
 *
 * Persistence model: lazy-load on first access, write-through with debounced
 * flush. Survives process restarts. Zero native deps (no sqlite/leveldb), so
 * the server runs on any Node 20+ host (including Devin sandboxes).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import type { Provenance, ToolResult } from "./provenance.js"

interface CacheEntry {
  request_hash: string
  envelope: ToolResult<unknown>
  /** Time-to-live in ms relative to provenance.cached_at. */
  ttl_ms: number
}

interface CacheFile {
  version: 1
  entries: Record<string, CacheEntry>
}

export class ProvenanceCache {
  private map = new Map<string, CacheEntry>()
  private dirty = false
  private flushTimer: NodeJS.Timeout | null = null
  private loaded = false

  constructor(
    private readonly path: string,
    private readonly defaultTtlMs: number = 1000 * 60 * 60 * 24, // 24h
  ) {}

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    try {
      const raw = await readFile(this.path, "utf8")
      const parsed = JSON.parse(raw) as CacheFile
      if (parsed.version !== 1) return
      for (const [k, v] of Object.entries(parsed.entries ?? {})) {
        this.map.set(k, v)
      }
    } catch {
      // No cache yet — that's fine.
    }
  }

  async get<T>(requestHash: string): Promise<ToolResult<T> | null> {
    await this.ensureLoaded()
    const entry = this.map.get(requestHash)
    if (!entry) return null
    const cachedAt = Date.parse(entry.envelope.provenance.cached_at)
    if (Number.isFinite(cachedAt) && Date.now() - cachedAt > entry.ttl_ms) {
      this.map.delete(requestHash)
      this.scheduleFlush()
      return null
    }
    // Re-stamp as cache_hit=true and zero latency without mutating original.
    const provenance: Provenance = {
      ...entry.envelope.provenance,
      cache_hit: true,
      upstream_latency_ms: 0,
    }
    return entry.envelope.ok
      ? { ok: true, data: entry.envelope.data as T, provenance }
      : { ok: false, error: entry.envelope.error, provenance }
  }

  async put<T>(requestHash: string, envelope: ToolResult<T>, ttlMs?: number): Promise<void> {
    await this.ensureLoaded()
    this.map.set(requestHash, {
      request_hash: requestHash,
      envelope,
      ttl_ms: ttlMs ?? this.defaultTtlMs,
    })
    this.scheduleFlush()
  }

  private scheduleFlush(): void {
    this.dirty = true
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      void this.flush()
    }, 500)
  }

  async flush(): Promise<void> {
    if (!this.dirty) return
    this.dirty = false
    const file: CacheFile = {
      version: 1,
      entries: Object.fromEntries(this.map.entries()),
    }
    await mkdir(dirname(this.path), { recursive: true })
    const tmp = `${this.path}.tmp`
    await writeFile(tmp, JSON.stringify(file), "utf8")
    // Rename for atomicity; on Windows fsPromises.rename overwrites.
    await writeFile(this.path, JSON.stringify(file), "utf8")
    void tmp
  }

  /** Drop everything. Useful for tests and the eval harness's clean-room runs. */
  async clear(): Promise<void> {
    this.map.clear()
    this.dirty = true
    await this.flush()
  }

  size(): number {
    return this.map.size
  }
}

export function defaultCachePath(cacheDir: string): string {
  return resolve(cacheDir, "cache.json")
}
