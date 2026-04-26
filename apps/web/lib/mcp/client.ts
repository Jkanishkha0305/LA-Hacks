/**
 * MCP client utility — spawns the SiteScope MCP server via stdio and
 * converts its tools into AI SDK dynamicTool instances. Each call
 * creates a fresh connection; callers must close when done.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { dynamicTool, jsonSchema, type ToolSet } from "ai"
import { resolve } from "node:path"

const MCP_ENTRY = resolve(process.cwd(), "..", "mcp-server", "src", "index.ts")

export interface McpConnection {
  client: Client
  tools: ToolSet
  /** Provenance envelopes collected from tool calls in this session. */
  provenanceLog: Array<Record<string, unknown>>
  close: () => Promise<void>
}

/**
 * Connect to the SiteScope MCP server and return AI SDK-compatible tools.
 * Each tool call result includes provenance metadata — we capture it in
 * `provenanceLog` so callers can surface it to the end user.
 */
export async function connectMcp(): Promise<McpConnection> {
  const client = new Client({ name: "sitescope-web", version: "0.1.0" })
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "tsx", MCP_ENTRY],
  })

  await client.connect(transport)
  const list = await client.listTools()

  const provenanceLog: Array<Record<string, unknown>> = []
  const tools: ToolSet = {}

  for (const t of list.tools) {
    tools[t.name] = dynamicTool({
      description: t.description ?? "",
      inputSchema: jsonSchema(t.inputSchema as Parameters<typeof jsonSchema>[0]),
      execute: async (input) => {
        const res = await client.callTool({
          name: t.name,
          arguments: input as Record<string, unknown>,
        })
        // Capture provenance from the MCP response for display.
        try {
          const textContent = (res.content as Array<{ type: string; text?: string }>)?.find(
            (c) => c.type === "text" && c.text,
          )
          if (textContent?.text) {
            const envelope = JSON.parse(textContent.text)
            if (envelope?.provenance) {
              provenanceLog.push({
                tool: t.name,
                ...envelope.provenance,
              })
            }
            // Return just the data to the model (provenance is logged separately).
            return envelope?.data ?? envelope
          }
        } catch {
          /* pass through raw */
        }
        return res
      },
    })
  }

  return {
    client,
    tools,
    provenanceLog,
    close: async () => {
      try {
        await client.close()
      } catch {
        /* swallow */
      }
    },
  }
}
