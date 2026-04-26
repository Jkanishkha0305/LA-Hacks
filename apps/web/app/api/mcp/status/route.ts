/**
 * GET /api/mcp/status — Quick health check for the MCP server.
 * Spawns a short-lived stdio connection, runs initialize + tools/list,
 * and returns the server info + tool count.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { resolve } from "node:path"

const MCP_ENTRY = resolve(process.cwd(), "..", "mcp-server", "src", "index.ts")

export async function GET() {
  const start = performance.now()
  const client = new Client({ name: "status-check", version: "0.1.0" })
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "tsx", MCP_ENTRY],
  })

  try {
    await client.connect(transport)
    const { tools } = await client.listTools()
    const { resources } = await client.listResources()
    const elapsed = Math.round(performance.now() - start)

    await client.close()

    return Response.json({
      status: "ok",
      server: "sitescope-mcp",
      version: "0.1.0",
      tools: tools.map((t) => ({ name: t.name, title: t.title })),
      resources: resources.map((r) => ({ uri: r.uri, name: r.name })),
      toolCount: tools.length,
      resourceCount: resources.length,
      latencyMs: elapsed,
    })
  } catch (err) {
    try { await client.close() } catch { /* */ }
    return Response.json(
      { status: "error", error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
