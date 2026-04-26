import type { PropertyAnalystUIMessage } from "@/lib/agents/property-analyst"
import {
  analysisArtifactSchema,
  type AnalysisArtifact,
  type MediaArtifact,
} from "@/lib/types/report"

const REPORT_TOOL_NAMES = [
  "geocodeAddress",
  "fetchParcelData",
  "fetchViolations",
  "fetchPermits",
  "fetchComplaints",
  "fetchSalesComps",
  "fetchRentData",
  "fetchCrimeData",
  "fetchCensusData",
] as const

type ReportToolName = (typeof REPORT_TOOL_NAMES)[number]
type RawData = AnalysisArtifact["rawData"]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function getTextPart(part: unknown): string | null {
  if (!isRecord(part) || part.type !== "text" || typeof part.text !== "string") {
    return null
  }

  return part.text
}

function getToolOutputPart(
  part: unknown,
): { type: `tool-${ReportToolName}`; output: unknown } | null {
  if (
    !isRecord(part) ||
    typeof part.type !== "string" ||
    !part.type.startsWith("tool-") ||
    part.state !== "output-available"
  ) {
    return null
  }

  const toolName = part.type.slice(5)
  if (!REPORT_TOOL_NAMES.includes(toolName as ReportToolName)) {
    return null
  }

  return {
    type: part.type as `tool-${ReportToolName}`,
    output: part.output,
  }
}

function getMessageText(message: PropertyAnalystUIMessage): string {
  return message.parts
    .map(getTextPart)
    .filter((value): value is string => Boolean(value))
    .join("")
    .trim()
}

function getLatestAssistantMessage(
  messages: PropertyAnalystUIMessage[],
): { index: number; message: PropertyAnalystUIMessage } | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (!message || message.role !== "assistant") continue

    if (getMessageText(message)) {
      return { index, message }
    }
  }

  return null
}

function getLatestUserPrompt(
  messages: PropertyAnalystUIMessage[],
  beforeIndex: number,
): string | null {
  for (let index = beforeIndex - 1; index >= 0; index--) {
    const message = messages[index]
    if (!message || message.role !== "user") continue

    const text = getMessageText(message)
    if (text) return text
  }

  return null
}

function extractRawData(message: PropertyAnalystUIMessage): RawData {
  const rawData: RawData = {}

  for (const part of message.parts) {
    const toolPart = getToolOutputPart(part)
    if (!toolPart) continue

    const name = toolPart.type.slice(5) as ReportToolName
    rawData[name] = toolPart.output
  }

  return rawData
}

function getRiskLevel(
  totalViolations: number,
  totalComplaints: number,
  totalPermits: number,
): "low" | "medium" | "high" {
  const score = totalViolations + totalComplaints + Math.min(totalPermits, 3)
  if (score >= 12) return "high"
  if (score >= 4) return "medium"
  return "low"
}

function getCrimeLevel(
  totalIncidents: number,
  seriousCrimeCount: number,
): "low" | "moderate" | "high" | null {
  if (totalIncidents === 0 && seriousCrimeCount === 0) return "low"
  if (seriousCrimeCount >= 5 || totalIncidents >= 40) return "high"
  if (seriousCrimeCount >= 1 || totalIncidents >= 12) return "moderate"
  return "low"
}

function formatFmrRange(rent: Record<string, unknown> | null): string | null {
  if (!rent) return null

  const values = [rent.oneBr, rent.twoBr, rent.threeBr].filter(
    (value): value is number => typeof value === "number",
  )

  if (values.length === 0) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  return `$${min.toLocaleString()}-$${max.toLocaleString()}`
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function hasRawData(artifact: AnalysisArtifact | null): boolean {
  if (!artifact) return false
  return Object.keys(artifact.rawData).length > 0
}

export function getReportFilename(artifact: AnalysisArtifact): string {
  const label =
    artifact.structuredAnalysis.property.address ||
    artifact.structuredAnalysis.property.bbl ||
    "property-analysis-report"

  const slug = slugify(label) || "property-analysis-report"
  return `${slug}-report.html`
}

export function buildAnalysisArtifact(
  messages: PropertyAnalystUIMessage[],
  mediaArtifacts: MediaArtifact[] = [],
): AnalysisArtifact | null {
  const latestAssistant = getLatestAssistantMessage(messages)
  if (!latestAssistant) return null

  const narrative = getMessageText(latestAssistant.message)
  const userPrompt = getLatestUserPrompt(messages, latestAssistant.index)
  if (!narrative || !userPrompt) return null

  const rawData = extractRawData(latestAssistant.message)
  const geocode = isRecord(rawData.geocodeAddress) ? rawData.geocodeAddress : null
  const parcel = isRecord(rawData.fetchParcelData) ? rawData.fetchParcelData : null
  const violations = isRecord(rawData.fetchViolations)
    ? rawData.fetchViolations
    : null
  const permits = isRecord(rawData.fetchPermits) ? rawData.fetchPermits : null
  const complaints = isRecord(rawData.fetchComplaints)
    ? rawData.fetchComplaints
    : null
  const sales = isRecord(rawData.fetchSalesComps) ? rawData.fetchSalesComps : null
  const rent = isRecord(rawData.fetchRentData) ? rawData.fetchRentData : null
  const crime = isRecord(rawData.fetchCrimeData) ? rawData.fetchCrimeData : null
  const census = isRecord(rawData.fetchCensusData) ? rawData.fetchCensusData : null

  const dobViolations =
    isRecord(violations?.dob) && typeof violations.dob.count === "number"
      ? violations.dob.count
      : 0
  const hpdViolations =
    isRecord(violations?.hpd) && typeof violations.hpd.count === "number"
      ? violations.hpd.count
      : 0
  const totalComplaints =
    typeof complaints?.totalComplaints === "number"
      ? complaints.totalComplaints
      : 0
  const totalPermits =
    typeof permits?.totalPermits === "number" ? permits.totalPermits : 0
  const totalIncidents =
    typeof crime?.totalIncidents === "number" ? crime.totalIncidents : 0
  const seriousCrimeCount =
    isRecord(crime?.bySeverity) && typeof crime.bySeverity.part1 === "number"
      ? crime.bySeverity.part1
      : 0
  const recentSales = 0

  const structuredAnalysis = {
    property: {
      bbl:
        (typeof geocode?.bbl === "string" && geocode.bbl) ||
        (typeof parcel?.apn === "string" && parcel.apn) ||
        "unknown",
      address:
        (typeof geocode?.label === "string" && geocode.label) ||
        (typeof parcel?.address === "string" && parcel.address) ||
        userPrompt,
      borough:
        (typeof geocode?.borough === "string" && geocode.borough) || "Los Angeles",
      neighbourhood:
        (typeof geocode?.neighbourhood === "string" && geocode.neighbourhood) ||
        null,
    },
    fundamentals: {
      buildingClass:
        (typeof parcel?.bldgclass === "string" && parcel.bldgclass) || null,
      totalUnits:
        typeof parcel?.unitstotal === "number" ? parcel.unitstotal : null,
      yearBuilt: typeof parcel?.yearbuilt === "number" ? parcel.yearbuilt : null,
      zoning: (typeof parcel?.zonedist1 === "string" && parcel.zonedist1) || null,
      far: typeof parcel?.builtfar === "number" ? parcel.builtfar : null,
      lotArea: typeof parcel?.lotarea === "number" ? parcel.lotarea : null,
      buildingArea: typeof parcel?.bldgarea === "number" ? parcel.bldgarea : null,
    },
    risk: {
      level: getRiskLevel(dobViolations + hpdViolations, totalComplaints, totalPermits),
      lahdViolations: dobViolations + hpdViolations,
      openPermits: totalPermits,
      complaints: totalComplaints,
      reasoning: [
        `${dobViolations + hpdViolations} LAHD violations/enforcement cases`,
        `${totalComplaints} nearby MyLA311 complaints`,
        `${totalPermits} active LADBS permits`,
      ].join(", "),
    },
    market: {
      avgPricePerSqft:
        typeof sales?.avgPricePerSqft === "number" ? sales.avgPricePerSqft : null,
      recentSales,
      fmrRange: formatFmrRange(rent),
    },
    location: {
      medianIncome:
        typeof census?.medianHouseholdIncome === "number"
          ? census.medianHouseholdIncome
          : null,
      crimeLevel: getCrimeLevel(totalIncidents, seriousCrimeCount),
    },
    evaluation: narrative,
  }

  return analysisArtifactSchema.parse({
    userPrompt,
    generatedAt: new Date().toISOString(),
    narrative,
    structuredAnalysis,
    rawData,
    mediaArtifacts,
  })
}
