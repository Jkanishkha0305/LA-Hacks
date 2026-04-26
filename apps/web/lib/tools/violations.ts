import { tool } from "ai"
import { z } from "zod"
import { socrataQuery, isSocrataError } from "@/lib/api/socrata"
import { LA_SOCRATA_DATASETS } from "@/lib/config/data-sources"
import type {
  LahdViolationRow,
  LahdInvestigationRow,
} from "@/lib/types/api-responses"

export const violationsTool = tool({
  description:
    "Fetch LAHD housing violations and enforcement cases for an LA property by address. Returns violation counts, types, and case status.",
  inputSchema: z.object({
    address: z.string().describe("Property street address in Los Angeles"),
  }),
  execute: async ({ address }) => {
    console.log(`\n[TOOL:fetchViolations] ▶ Input: address="${address}"`)
    const searchAddr = address.split(',')[0]?.trim().toUpperCase() ?? address.toUpperCase()

    const [violResult, enfResult] = await Promise.all([
      socrataQuery<LahdViolationRow>(
        LA_SOCRATA_DATASETS.lahdViolations,
        { $where: `upper(address) like '%${searchAddr}%'`, $limit: "50" },
        "lahd_violations",
      ),
      socrataQuery<LahdInvestigationRow>(
        LA_SOCRATA_DATASETS.lahdInvestigation,
        { $where: `upper(officialaddress) like '%${searchAddr}%'`, $limit: "50", $order: "case_filed_date DESC" },
        "lahd_investigation",
      ),
    ])

    const violations = isSocrataError(violResult)
      ? { count: 0, records: [], error: violResult.error }
      : {
          count: violResult.length,
          records: violResult.slice(0, 10).map((v) => ({
            apn: v.apn,
            address: v.address,
            violationType: v.violationtype,
            cited: parseInt(v.violations_cited) || 0,
            cleared: parseInt(v.violations_cleared) || 0,
          })),
        }

    const enforcement = isSocrataError(enfResult)
      ? { count: 0, cases: [], error: enfResult.error }
      : {
          count: enfResult.length,
          cases: enfResult.slice(0, 10).map((c) => ({
            apn: c.apn,
            address: c.officialaddress,
            caseType: c.casetype,
            filedDate: c.case_filed_date,
            closedDate: c.closed_date,
          })),
        }

    const result = { violations, enforcement, totalIssues: violations.count + enforcement.count }
    console.log(`[TOOL:fetchViolations] ✓ violations=${violations.count} enforcement=${enforcement.count} total=${result.totalIssues}`)
    return result
  },
})
