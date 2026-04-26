#!/usr/bin/env node
/**
 * Entry point: stdio transport.
 * This is what Claude Desktop, Cursor, Windsurf, and Devin spawn.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { buildServer } from "./server.js"

async function main(): Promise<void> {
  const handle = await buildServer()
  const transport = new StdioServerTransport()

  // Graceful shutdown: flush cache + close transport on SIGINT/SIGTERM.
  const stop = async (signal: string) => {
    process.stderr.write(`[sitescope-mcp] caught ${signal}, shutting down…\n`)
    try {
      await handle.shutdown()
    } catch (err) {
      process.stderr.write(`[sitescope-mcp] shutdown error: ${String(err)}\n`)
    }
    process.exit(0)
  }
  process.on("SIGINT", () => void stop("SIGINT"))
  process.on("SIGTERM", () => void stop("SIGTERM"))

  await handle.server.connect(transport)
  process.stderr.write(`[sitescope-mcp] connected (session=${handle.journal.sessionId})\n`)
}

main().catch((err) => {
  process.stderr.write(`[sitescope-mcp] fatal: ${err instanceof Error ? err.stack : String(err)}\n`)
  process.exit(1)
})
