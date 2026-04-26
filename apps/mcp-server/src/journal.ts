/**
 * Append-only JSONL session journal.
 *
 * Every MCP tool call writes one line. Sessions are deterministically
 * replayable: given the same cache + the same journal, you get the same
 * outputs. This is the "session replay" pillar — it lets:
 *
 *   • humans audit what an agent did and why
 *   • coding agents resume a partial run after a crash
 *   • Cognition's Devin re-run a regression test deterministically
 *   • debug-by-rewind: pick an entry and re-execute from there
 */
import { mkdir, readFile, appendFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname, resolve, join } from "node:path"
import { randomUUID } from "node:crypto"
import type { Provenance, ToolResult } from "./provenance.js"

export interface JournalEntry {
  /** Monotonic step counter within the session. */
  step: number
  /** ISO-8601 wall-clock. */
  ts: string
  /** Tool that was invoked. */
  tool: string
  /** Tool input as it arrived at the server (post-validation). */
  input: unknown
  /** Whether the call succeeded (mirrors envelope.ok). */
  ok: boolean
  /** Error message if !ok. */
  error?: string
  /** Provenance metadata copied from the envelope. */
  provenance: Provenance
}

export class SessionJournal {
  private step = 0

  constructor(
    public readonly sessionId: string,
    private readonly path: string,
  ) {}

  static create(rootDir: string, sessionId?: string): SessionJournal {
    const id = sessionId ?? `s_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`
    const path = join(rootDir, "sessions", `${id}.jsonl`)
    return new SessionJournal(id, path)
  }

  async write<T>(tool: string, input: unknown, result: ToolResult<T>): Promise<void> {
    this.step += 1
    const entry: JournalEntry = {
      step: this.step,
      ts: new Date().toISOString(),
      tool,
      input,
      ok: result.ok,
      error: result.ok ? undefined : result.error,
      provenance: result.provenance,
    }
    if (!existsSync(dirname(this.path))) {
      await mkdir(dirname(this.path), { recursive: true })
    }
    await appendFile(this.path, JSON.stringify(entry) + "\n", "utf8")
  }

  async read(): Promise<JournalEntry[]> {
    if (!existsSync(this.path)) return []
    const raw = await readFile(this.path, "utf8")
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as JournalEntry)
  }
}

export async function readSession(rootDir: string, sessionId: string): Promise<JournalEntry[]> {
  const path = resolve(rootDir, "sessions", `${sessionId}.jsonl`)
  if (!existsSync(path)) return []
  const raw = await readFile(path, "utf8")
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as JournalEntry)
}
