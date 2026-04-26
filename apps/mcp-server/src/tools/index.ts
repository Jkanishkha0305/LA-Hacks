/** Tool registry. Adding a new tool? Import + push it here. */
import type { ProvenanceCache } from "../cache.js"
import type { SessionJournal } from "../journal.js"
import type { ToolDefinition } from "../runtime.js"
import { geocodeTool } from "./geocode.js"
import { parcelTool } from "./parcel.js"
import { permitsTool } from "./permits.js"
import { crimeTool } from "./crime.js"
import { violationsTool } from "./violations.js"
import { complaintsTool } from "./complaints.js"
import { censusTool } from "./census.js"
import { rentTool } from "./rent.js"
import { marketTool } from "./sales.js"
import { tocTierTool } from "./toc-tier.js"
import { makeVerifyClaimTool } from "./verify-claim.js"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildToolRegistry(cache: ProvenanceCache, journal: SessionJournal): ToolDefinition<any, any>[] {
  return [
    geocodeTool,
    parcelTool,
    permitsTool,
    crimeTool,
    violationsTool,
    complaintsTool,
    censusTool,
    rentTool,
    marketTool,
    tocTierTool,
    makeVerifyClaimTool(cache, journal),
  ]
}

export {
  geocodeTool,
  parcelTool,
  permitsTool,
  crimeTool,
  violationsTool,
  complaintsTool,
  censusTool,
  rentTool,
  marketTool,
  tocTierTool,
  makeVerifyClaimTool,
}
