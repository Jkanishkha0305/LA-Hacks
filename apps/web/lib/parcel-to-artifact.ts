import type { PinnedParcel } from "@/lib/types"
import type { AnalysisArtifact } from "@/lib/types/report"
import { analysisArtifactSchema } from "@/lib/types/report"

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function buildArtifactFromParcel(
  parcel: PinnedParcel,
): AnalysisArtifact | null {
  if (parcel.status !== "ready" || !parcel.data) return null

  const data = parcel.data

  return analysisArtifactSchema.parse({
    userPrompt: `Analyze development potential for ${parcel.address}`,
    generatedAt: new Date().toISOString(),
    narrative: data.interpretation,
    structuredAnalysis: {
      property: {
        bbl: parcel.bbl,
        address: parcel.address,
        borough: parcel.borough,
        neighbourhood: null,
      },
      fundamentals: {
        buildingClass: data.buildingClass || null,
        totalUnits: data.unitsTotal || null,
        yearBuilt: data.yearBuilt || null,
        zoning: data.zoningDistrict || null,
        far: data.builtFAR || null,
        lotArea: data.lotArea || null,
        buildingArea: data.buildingArea || null,
      },
      risk: {
        level: "low",
        dobViolations: 0,
        hpdViolations: 0,
        openPermits: 0,
        complaints: 0,
        reasoning:
          "Risk data not available from parcel view — use chat analysis for detailed risk assessment.",
      },
      market: {
        avgPricePerSqft: null,
        recentSales: 0,
        fmrRange: null,
      },
      location: {
        medianIncome: null,
        crimeLevel: null,
      },
      evaluation: data.interpretation,
    },
    rawData: {
      fetchParcelData: {
        bbl: parcel.bbl,
        address: parcel.address,
        bldgclass: data.buildingClass,
        lotarea: data.lotArea,
        bldgarea: data.buildingArea,
        numfloors: data.numFloors,
        unitsres: data.unitsRes,
        unitstotal: data.unitsTotal,
        yearbuilt: data.yearBuilt,
        zonedist1: data.zoningDistrict,
        builtfar: data.builtFAR,
        residfar: data.residFAR,
        commfar: data.commFAR,
        facilfar: data.facilFAR,
        ownername: data.ownerName,
      },
    },
    mediaArtifacts: [],
  })
}

export function buildArtifactFromComparison(
  parcels: PinnedParcel[],
): AnalysisArtifact | null {
  const readyParcels = parcels.filter(
    (p) => p.status === "ready" && p.data,
  )
  if (readyParcels.length < 2) return null

  const addresses = readyParcels.map((p) => p.address).join(" vs ")
  const narratives = readyParcels
    .map(
      (p) =>
        `## ${p.address} (BBL ${p.bbl})\n${p.data!.interpretation}`,
    )
    .join("\n\n")

  const comparisonSummary = readyParcels
    .map((p) => {
      const d = p.data!
      return [
        `**${p.address}** — ${p.borough}`,
        `Zoning: ${d.zoningDistrict}, Built FAR: ${d.builtFAR}, Max FAR: ${d.maxFAR}, Upside: +${d.farUpside.toFixed(2)}`,
        `Lot: ${d.lotArea.toLocaleString()} SF, Max Buildable: ${d.maxBuildableSF.toLocaleString()} SF`,
        `Score: ${d.score.toUpperCase()}, TOC: ${d.tocTier || "N/A"}`,
        d.incentives?.length
          ? `Incentives: ${d.incentives.map((i) => i.name).join(", ")}`
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    })
    .join("\n\n---\n\n")

  const narrative = `# Comparison: ${addresses}\n\n${comparisonSummary}\n\n---\n\n${narratives}`

  // Use the first parcel for structuredAnalysis scaffold
  const primary = readyParcels[0]!
  const primaryData = primary.data!

  // Embed all parcels' data in rawData for the report generator
  const rawData: Record<string, unknown> = {}
  readyParcels.forEach((p, i) => {
    const d = p.data!
    rawData[`parcel_${i + 1}_data`] = {
      bbl: p.bbl,
      address: p.address,
      borough: p.borough,
      bldgclass: d.buildingClass,
      lotarea: d.lotArea,
      bldgarea: d.buildingArea,
      numfloors: d.numFloors,
      unitsres: d.unitsRes,
      unitstotal: d.unitsTotal,
      yearbuilt: d.yearBuilt,
      zonedist1: d.zoningDistrict,
      builtfar: d.builtFAR,
      residfar: d.residFAR,
      commfar: d.commFAR,
      facilfar: d.facilFAR,
      maxfar: d.maxFAR,
      farupside: d.farUpside,
      maxbuildablesf: d.maxBuildableSF,
      score: d.score,
      toctier: d.tocTier,
      tocbonusfar: d.tocBonusFAR,
      ownername: d.ownerName,
      landmark: d.landmark,
      histdist: d.histDist,
      edesignum: d.eDesigNum,
      firehazardzone: d.fireHazardZone,
      isfirehazard: d.isFireHazard,
      faultzone: d.faultZone,
      isfaulthazard: d.isFaultHazard,
      interpretation: d.interpretation,
      incentives: d.incentives,
      envThresholds: d.envThresholds,
      scenarios: d.scenarios,
    }
  })

  return analysisArtifactSchema.parse({
    userPrompt: `Compare development potential: ${addresses}`,
    generatedAt: new Date().toISOString(),
    narrative,
    structuredAnalysis: {
      property: {
        bbl: primary.bbl,
        address: primary.address,
        borough: primary.borough,
        neighbourhood: null,
      },
      fundamentals: {
        buildingClass: primaryData.buildingClass || null,
        totalUnits: primaryData.unitsTotal || null,
        yearBuilt: primaryData.yearBuilt || null,
        zoning: primaryData.zoningDistrict || null,
        far: primaryData.builtFAR || null,
        lotArea: primaryData.lotArea || null,
        buildingArea: primaryData.buildingArea || null,
      },
      risk: {
        level: "low",
        dobViolations: 0,
        hpdViolations: 0,
        openPermits: 0,
        complaints: 0,
        reasoning:
          "Comparison report — see individual parcel sections for details.",
      },
      market: {
        avgPricePerSqft: null,
        recentSales: 0,
        fmrRange: null,
      },
      location: {
        medianIncome: null,
        crimeLevel: null,
      },
      evaluation: narrative,
    },
    rawData,
    mediaArtifacts: [],
  })
}

export function getParcelReportFilename(parcel: PinnedParcel): string {
  const slug = slugify(parcel.address) || "property-report"
  return `${slug}-report.html`
}

export function getComparisonReportFilename(
  parcels: PinnedParcel[],
): string {
  if (parcels.length <= 2) {
    const slugs = parcels.map((p) => slugify(p.address.split(",")[0] || p.bbl))
    return `${slugs.join("-vs-")}-comparison.html`
  }
  return `${parcels.length}-parcel-comparison.html`
}
