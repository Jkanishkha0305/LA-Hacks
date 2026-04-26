/**
 * Ground-truth tasks for the eval harness. Each task is a question + a list of
 * fact assertions to score the agent's answer against. Picking facts that are
 * upstream-verifiable (not opinions).
 */
export interface FactCheck {
  /** Human label for the fact (used in scorecard). */
  label: string
  /** Case-insensitive substrings — answer must contain at least one. */
  acceptableSubstrings: string[]
}

export interface EvalTask {
  id: string
  prompt: string
  facts: FactCheck[]
  /** Optional notes for the human reading the report. */
  notes?: string
}

export const EVAL_TASKS: EvalTask[] = [
  {
    id: "T01-grand-park",
    prompt:
      "What is the LA City parcel APN, lot area in square feet, and zoning at 200 N Grand Ave, Los Angeles? Cite your sources.",
    facts: [
      { label: "Mentions APN", acceptableSubstrings: ["apn", "5161-", "parcel number"] },
      { label: "Mentions lot area", acceptableSubstrings: ["sqft", "square feet", "lot area"] },
      { label: "Mentions zoning", acceptableSubstrings: ["zoning", "zone", "PF", "OS", "civic"] },
      { label: "Cites LA City data", acceptableSubstrings: ["data.lacity", "socrata", "qyra-qm2s", "la city"] },
    ],
  },
  {
    id: "T02-permits-walkscore",
    prompt:
      "How many LADBS building permits are within 200m of 1111 S Figueroa St, Los Angeles? Summarize the most common permit types.",
    facts: [
      { label: "Returns a permit count", acceptableSubstrings: ["permits", "permit"] },
      { label: "References LADBS source", acceptableSubstrings: ["ladbs", "lacity.org", "lahub"] },
      { label: "Mentions permit type breakdown", acceptableSubstrings: ["plumbing", "electrical", "building", "mechanical", "type"] },
    ],
  },
  {
    id: "T03-toc-tier",
    prompt:
      "Is 350 S Grand Ave, Los Angeles inside a Transit-Oriented Communities (TOC) area? If yes, which tier?",
    facts: [
      { label: "Discusses TOC tier", acceptableSubstrings: ["tier", "toc", "transit-oriented"] },
      { label: "Cites Measure JJJ", acceptableSubstrings: ["jjj", "measure jjj", "density bonus"] },
    ],
  },
  {
    id: "T04-crime-context",
    prompt:
      "Summarize LAPD crime activity within 300m of 633 W 5th St, Los Angeles in the past 12 months. Break down by Part I vs Part II.",
    facts: [
      { label: "Mentions Part I/II", acceptableSubstrings: ["part 1", "part i", "part 2", "part ii", "part one", "part two"] },
      { label: "References LAPD source", acceptableSubstrings: ["lapd", "data.lacity", "2nrs-mtv8"] },
      { label: "Includes count", acceptableSubstrings: ["incident", "report", "crime"] },
    ],
  },
  {
    id: "T05-rent-fmr",
    prompt:
      "What is the HUD Fair Market Rent for a 2-bedroom apartment in Los Angeles County?",
    facts: [
      { label: "Returns a 2BR rent figure", acceptableSubstrings: ["$2", "2,4", "2480", "2,480", "fmr"] },
      { label: "Cites HUD source", acceptableSubstrings: ["hud", "fair market rent", "fmr"] },
    ],
  },
  {
    id: "T06-cross-tool",
    prompt:
      "For 200 N Spring St, Los Angeles, give me: (a) the parcel zoning, (b) median household income for the census tract, and (c) any LAHD violations on file. Be specific.",
    facts: [
      { label: "Mentions zoning", acceptableSubstrings: ["zoning", "zone"] },
      { label: "Mentions median income", acceptableSubstrings: ["income", "median household", "$"] },
      { label: "Mentions LAHD", acceptableSubstrings: ["lahd", "violation", "enforcement"] },
    ],
    notes: "Multi-tool composition test — agent must chain ≥3 tools to answer.",
  },
  {
    id: "T07-verify-claim",
    prompt:
      "Verify the following claim: the lot at lat 34.0522, lng -118.2437 has a lot area of exactly 1000 sqft. Use the verify_claim tool. Report verdict and any diff.",
    facts: [
      { label: "Calls verify_claim", acceptableSubstrings: ["verify_claim", "verify", "verdict"] },
      { label: "Reports verdict", acceptableSubstrings: ["verified", "contradicted", "unverifiable"] },
      { label: "Includes lot area diff", acceptableSubstrings: ["sqft", "lot area", "diff"] },
    ],
    notes: "Tests verify_claim integration. The 1000 sqft claim is almost certainly false → expect 'contradicted'.",
  },
]
