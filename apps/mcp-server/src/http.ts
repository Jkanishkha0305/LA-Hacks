#!/usr/bin/env node
/**
 * Entry point: Streamable HTTP transport.
 * For remote agents (Devin sandboxes, ASI:One, OmegaClaw skills, web hosts).
 *
 * POST /mcp        — single shot or initialize-an-MCP-session
 * GET  /mcp        — server-initiated SSE (long-poll for streaming)
 * DELETE /mcp      — terminate an existing session
 *
 * Session-IDs are issued via the `mcp-session-id` response header and must be
 * echoed back by the client on subsequent calls. Each session gets its own
 * journal — perfect for multi-tenant remote use.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { randomUUID } from "node:crypto"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js"
import { buildServer, type ServerHandle } from "./server.js"
import { env } from "./config.js"

interface SessionRecord {
  transport: StreamableHTTPServerTransport
  handle: ServerHandle
}

const sessions = new Map<string, SessionRecord>()

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = []
    req.on("data", (c: Buffer) => chunks.push(c))
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8")
        resolveBody(raw ? JSON.parse(raw) : {})
      } catch (err) {
        reject(err)
      }
    })
    req.on("error", reject)
  })
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!req.url?.startsWith("/mcp")) {
    res.statusCode = 404
    res.end("Not found")
    return
  }
  const sessionId = req.headers["mcp-session-id"] as string | undefined

  if (req.method === "POST") {
    const body = await readJsonBody(req)
    let record: SessionRecord | undefined = sessionId ? sessions.get(sessionId) : undefined

    if (!record && isInitializeRequest(body)) {
      const newId = randomUUID()
      const handle = await buildServer({ sessionId: newId })
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newId,
        onsessioninitialized: (id) => {
          sessions.set(id, { transport, handle })
        },
      })
      transport.onclose = () => {
        const id = transport.sessionId
        if (id && sessions.has(id)) {
          void sessions.get(id)?.handle.shutdown()
          sessions.delete(id)
        }
      }
      await handle.server.connect(transport)
      record = { transport, handle }
    }

    if (!record) {
      res.statusCode = 400
      res.setHeader("content-type", "application/json")
      res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "No valid session id" }, id: null }))
      return
    }
    await record.transport.handleRequest(req, res, body)
    return
  }

  if ((req.method === "GET" || req.method === "DELETE") && sessionId) {
    const record = sessions.get(sessionId)
    if (!record) {
      res.statusCode = 404
      res.end("Unknown session")
      return
    }
    await record.transport.handleRequest(req, res)
    return
  }

  res.statusCode = 405
  res.end("Method not allowed")
}

const httpServer = createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    process.stderr.write(`[sitescope-mcp:http] error: ${err instanceof Error ? err.stack : String(err)}\n`)
    if (!res.headersSent) {
      res.statusCode = 500
      res.end("Internal error")
    }
  })
})

httpServer.listen(env.HTTP_PORT, () => {
  process.stderr.write(`[sitescope-mcp] HTTP transport listening on http://localhost:${env.HTTP_PORT}/mcp\n`)
  process.stderr.write(`[sitescope-mcp] active sessions: ${sessions.size}\n`)
})

const stop = async () => {
  for (const { handle } of sessions.values()) {
    try {
      await handle.shutdown()
    } catch {
      /* swallow */
    }
  }
  httpServer.close(() => process.exit(0))
}
process.on("SIGINT", () => void stop())
process.on("SIGTERM", () => void stop())
