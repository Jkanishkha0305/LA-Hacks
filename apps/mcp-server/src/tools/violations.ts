/**
 * fetch_violations — LAHD housing violations + enforcement cases by address.
 */
import { z } from "zod"
import { LA_SOCRATA_BASE, LA_SOCRATA_DATASETS, env, withTimeout } from "../config.js"
import type { ToolDefinition } from "../runtime.js"

const inputSchema = z.object({
  address: z.string().min(3).describe("Property street address (city/state will be stripped)."),
})

export interface ViolationsOutput {
  violations: {
    count: number
    records: Array<{
      apn: string
      address: string
      violationType: string
      cited: number
      cleared: number
    }>
  }
  enforcement: {
    count: number
    cases: Array<{
      apn: string
      address: string
      caseType: string
      filedDate: string
      closedDate: string
    }>
  }
  totalIssues: number
}

async function socrata<T = Record<string, string>>(
  ctx: { trackedFetch: (url: string, init?: RequestInit & { sourceId?: string; sourceLabel?: string }) => Promise<Response> },
  datasetId: string,
  sourceLabel: string,
  where: string,
  limit = 50,
): Promise<T[]> {
  const url = new URL(`${LA_SOCRATA_BASE}/${datasetId}.json`)
  url.searchParams.set("$where", where)
  url.searchParams.set("$limit", String(limit))
  if (env.SOCRATA_APP_TOKEN) url.searchParams.set("$$app_token", env.SOCRATA_APP_TOKEN)
  const res = await ctx.trackedFetch(url.toString(), {
    signal: withTimeout(10_000),
    sourceId: `lacity_socrata:${datasetId}`,
    sourceLabel,
  })
  if (!res.ok) throw new Error(`Socrata ${datasetId} HTTP ${res.status}`)
  return (await res.json()) as T[]
}

export const violationsTool: ToolDefinition<z.infer<typeof inputSchema>, ViolationsOutput> = {
  name: "fetch_violations",
  version: "1.0.0",
  title: "Fetch LAHD violations",
  description:
    "Fetch LAHD (LA Housing Department) violations and enforcement cases for a property by address. Critical for evaluating slumlord risk on multifamily acquisitions.",
  inputSchema,
  cacheTtlMs: 1000 * 60 * 60 * 24,
  execute: async ({ address }, ctx) => {
    const searchAddr = (address.split(",")[0] ?? address).trim().toUpperCase()
    const escaped = searchAddr.replace(/'/g, "''")

    const [vRows, eRows] = await Promise.all([
      socrata(
        ctx,
        LA_SOCRATA_DATASETS.lahdViolations,
        "LAHD Property Look-Up for Violations",
        `upper(address) like '%${escaped}%'`,
        50,
      ),
      socrata(
        ctx,
        LA_SOCRATA_DATASETS.lahdInvestigation,
        "LAHD Investigation & Enforcement Cases",
        `upper(officialaddress) like '%${escaped}%'`,
        50,
      ),
    ])

    const violationRecords = vRows.slice(0, 15).map((v) => ({
      apn: String(v.apn ?? ""),
      address: String(v.address ?? ""),
      violationType: String(v.violationtype ?? ""),
      cited: parseInt(String(v.violations_cited ?? "0")) || 0,
      cleared: parseInt(String(v.violations_cleared ?? "0")) || 0,
    }))

    const enforcementCases = eRows.slice(0, 15).map((c) => ({
      apn: String(c.apn ?? ""),
      address: String(c.officialaddress ?? ""),
      caseType: String(c.casetype ?? ""),
      filedDate: String(c.case_filed_date ?? ""),
      closedDate: String(c.closed_date ?? ""),
    }))

    return {
      violations: { count: vRows.length, records: violationRecords },
      enforcement: { count: eRows.length, cases: enforcementCases },
      totalIssues: vRows.length + eRows.length,
    }
  },
}
