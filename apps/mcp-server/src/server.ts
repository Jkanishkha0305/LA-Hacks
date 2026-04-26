/**
 * Build the McpServer instance: registers all tools + resources.
 * Shared between stdio (src/index.ts) and HTTP (src/http.ts) transports.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { resolve } from "node:path"
import { ProvenanceCache, defaultCachePath } from "./cache.js"
import { SessionJournal, readSession } from "./journal.js"
import { runTool } from "./runtime.js"
import { buildToolRegistry } from "./tools/index.js"
import { env } from "./config.js"

export interface ServerHandle {
  server: McpServer
  cache: ProvenanceCache
  journal: SessionJournal
  shutdown: () => Promise<void>
}

export async function buildServer(opts?: { sessionId?: string }): Promise<ServerHandle> {
  const cacheDir = resolve(env.CACHE_DIR)
  const cache = new ProvenanceCache(defaultCachePath(cacheDir))
  const journal = SessionJournal.create(cacheDir, opts?.sessionId)

  const server = new McpServer({
    name: "sitescope-mcp",
    version: "0.1.0",
  })

  const tools = buildToolRegistry(cache, journal)

  for (const tool of tools) {
    // The MCP SDK's high-level .tool() takes Zod *shape* (not the wrapping object).
    // Most of our tools use z.object({...}) at the top — extract the shape.
    // For verify_claim, the input wraps a discriminated union; we expose
    // the full schema as a single 'claim' parameter.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shape = (tool.inputSchema as any)?.shape ?? {}

    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: shape,
      },
      async (rawInput: unknown) => {
        const result = await runTool(tool, rawInput, { cache, journal })
        // MCP wants `content` (text/image/etc) — we serialize the envelope as JSON
        // so callers see provenance, not just bare data.
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
          isError: !result.ok,
        }
      },
    )
  }

  // Resource: replay a session. Agents (or humans) can ask for any past
  // session journal back as a structured artifact.
  server.registerResource(
    "session",
    "session://{id}",
    {
      title: "Session replay",
      description:
        "Read the full journal of an MCP session (every tool call, input, output, provenance). URI scheme: session://<sessionId>. The current session ID is available as session://current.",
    },
    async (uri: URL) => {
      const id = uri.pathname.replace(/^\//, "") || uri.host
      const targetId = id === "current" ? journal.sessionId : id
      const entries = await readSession(cacheDir, targetId)
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/jsonl",
            text: entries.map((e) => JSON.stringify(e)).join("\n"),
          },
        ],
      }
    },
  )

  // Resource: cache stats — useful for debugging / showing the agent the cache is hot.
  server.registerResource(
    "cache-stats",
    "cache://stats",
    {
      title: "Cache statistics",
      description: "Current size and basic stats for the content-addressed provenance cache.",
    },
    async (uri: URL) => ({
      contents: [
        {
          uri: uri.toString(),
          mimeType: "application/json",
          text: JSON.stringify({ size: cache.size(), cache_dir: cacheDir, current_session: journal.sessionId }, null, 2),
        },
      ],
    }),
  )

  return {
    server,
    cache,
    journal,
    shutdown: async () => {
      await cache.flush()
      await server.close()
    },
  }
}
