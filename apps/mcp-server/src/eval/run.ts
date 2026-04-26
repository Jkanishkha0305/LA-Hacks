#!/usr/bin/env node
/**
 * Eval harness — measures whether the SiteScope MCP makes a coding agent
 * measurably better at LA real-estate due-diligence tasks.
 *
 * Two arms:
 *   baseline  — Gemini Flash with no tools (knowledge cutoff only)
 *   mcp       — Gemini Flash + the SiteScope MCP tools, accessed via the
 *               official @modelcontextprotocol/sdk client over stdio
 *
 * Outputs a markdown scorecard to stdout. Use as evidence for Cognition.
 *
 * Run:
 *   GOOGLE_GENERATIVE_AI_API_KEY=… pnpm --filter @workspace/mcp-server eval
 */
import { generateText, dynamicTool, jsonSchema, stepCountIs, type ToolSet } from "ai"
import { google } from "@ai-sdk/google"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { EVAL_TASKS, type EvalTask } from "./tasks.js"

const HERE = dirname(fileURLToPath(import.meta.url))
const ENTRY = resolve(HERE, "..", "index.ts")

interface RunResult {
  taskId: string
  arm: "baseline" | "mcp"
  text: string
  toolCalls: number
  latencyMs: number
  factsHit: number
  factsTotal: number
  scorePct: number
  error?: string
}

function scoreFacts(answer: string, task: EvalTask): { hit: number; total: number } {
  const lower = answer.toLowerCase()
  let hit = 0
  for (const fact of task.facts) {
    if (fact.acceptableSubstrings.some((sub) => lower.includes(sub.toLowerCase()))) hit += 1
  }
  return { hit, total: task.facts.length }
}

async function runBaseline(task: EvalTask): Promise<RunResult> {
  const start = performance.now()
  try {
    const { text } = await generateText({
      model: google("gemini-2.0-flash"),
      prompt: task.prompt,
    })
    const score = scoreFacts(text, task)
    return {
      taskId: task.id,
      arm: "baseline",
      text,
      toolCalls: 0,
      latencyMs: Math.round(performance.now() - start),
      factsHit: score.hit,
      factsTotal: score.total,
      scorePct: (score.hit / score.total) * 100,
    }
  } catch (err) {
    return {
      taskId: task.id,
      arm: "baseline",
      text: "",
      toolCalls: 0,
      latencyMs: Math.round(performance.now() - start),
      factsHit: 0,
      factsTotal: task.facts.length,
      scorePct: 0,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Spin up the MCP server via stdio, list its tools, and wrap each as an
 * AI-SDK-compatible dynamicTool that proxies to client.callTool().
 */
async function buildMcpToolset(client: Client): Promise<ToolSet> {
  const list = await client.listTools()
  const tools: ToolSet = {}
  for (const t of list.tools) {
    tools[t.name] = dynamicTool({
      description: t.description ?? "",
      // The MCP server publishes JSON Schema — feed it straight to the AI SDK.
      inputSchema: jsonSchema(t.inputSchema as Parameters<typeof jsonSchema>[0]),
      execute: async (input) => {
        const res = await client.callTool({ name: t.name, arguments: input as Record<string, unknown> })
        // Return the structured envelope as a plain JSON object; AI SDK will
        // serialize it for the model. The provenance is preserved end-to-end.
        return res
      },
    })
  }
  return tools
}

async function runWithMCP(task: EvalTask): Promise<RunResult> {
  const start = performance.now()
  const client = new Client({ name: "sitescope-eval", version: "0.1.0" })
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "tsx", ENTRY],
  })
  try {
    await client.connect(transport)
    const tools = await buildMcpToolset(client)
    const result = await generateText({
      model: google("gemini-2.0-flash"),
      tools,
      prompt: task.prompt,
      // Allow up to 8 tool-using steps before stopping.
      stopWhen: stepCountIs(8),
    })
    const toolCalls = result.steps.reduce((acc, step) => acc + (step.toolCalls?.length ?? 0), 0)
    const score = scoreFacts(result.text, task)
    return {
      taskId: task.id,
      arm: "mcp",
      text: result.text,
      toolCalls,
      latencyMs: Math.round(performance.now() - start),
      factsHit: score.hit,
      factsTotal: score.total,
      scorePct: (score.hit / score.total) * 100,
    }
  } catch (err) {
    return {
      taskId: task.id,
      arm: "mcp",
      text: "",
      toolCalls: 0,
      latencyMs: Math.round(performance.now() - start),
      factsHit: 0,
      factsTotal: task.facts.length,
      scorePct: 0,
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    try {
      await client.close()
    } catch {
      /* swallow */
    }
  }
}

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + " ".repeat(w - s.length)
}

function printScorecard(results: RunResult[]): void {
  console.log("# SiteScope MCP — Eval Scorecard\n")
  console.log(`> Model: gemini-2.0-flash | Tasks: ${EVAL_TASKS.length} | Generated: ${new Date().toISOString()}\n`)

  console.log("| Task | Arm | Score | Tool calls | Latency |")
  console.log("|------|-----|-------|-----------:|--------:|")
  for (const r of results) {
    const scoreStr = r.error ? `ERR: ${r.error.slice(0, 40)}` : `${r.factsHit}/${r.factsTotal} (${r.scorePct.toFixed(0)}%)`
    console.log(`| ${pad(r.taskId, 22)} | ${pad(r.arm, 8)} | ${pad(scoreStr, 18)} | ${pad(String(r.toolCalls), 10)} | ${r.latencyMs}ms |`)
  }

  const baselineResults = results.filter((r) => r.arm === "baseline")
  const mcpResults = results.filter((r) => r.arm === "mcp")
  const avg = (xs: RunResult[]) => xs.reduce((s, r) => s + r.scorePct, 0) / Math.max(xs.length, 1)
  const totalToolCalls = mcpResults.reduce((s, r) => s + r.toolCalls, 0)

  console.log("\n## Summary\n")
  console.log(`- **Baseline avg accuracy**: ${avg(baselineResults).toFixed(1)}%`)
  console.log(`- **MCP avg accuracy**:      ${avg(mcpResults).toFixed(1)}%`)
  console.log(`- **Δ accuracy**:            ${(avg(mcpResults) - avg(baselineResults)).toFixed(1)} pts`)
  console.log(`- **Total MCP tool calls**:  ${totalToolCalls}`)
}

async function main(): Promise<void> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    console.error("GOOGLE_GENERATIVE_AI_API_KEY not set. Skipping eval.")
    process.exit(1)
  }
  const results: RunResult[] = []
  for (const task of EVAL_TASKS) {
    process.stderr.write(`[eval] ${task.id} — baseline...\n`)
    results.push(await runBaseline(task))
    process.stderr.write(`[eval] ${task.id} — mcp...\n`)
    results.push(await runWithMCP(task))
  }
  printScorecard(results)
}

main().catch((err) => {
  console.error("eval crashed:", err)
  process.exit(1)
})
