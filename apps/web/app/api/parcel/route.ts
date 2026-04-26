import { generateObject } from 'ai'
import { GeminiModel } from '@/lib/config/models'
import { getGoogleProvider } from '@/lib/google-provider'
import { z } from 'zod'
import { computeMaxFAR, computeScore, computeScenarios } from '@/lib/zoning'
import type { NeighborhoodData } from '@/lib/types'
import type { DevelopmentScenario } from '@/lib/zoning'
import { LA_ARCGIS_LAYERS, LA_SOCRATA_BASE, LA_SOCRATA_DATASETS } from '@/lib/config/data-sources'

// Vercel serverless timeout — 3 external APIs + Gemini needs >10s default
export const maxDuration = 30

const SYSTEM_PROMPT = `You are a Los Angeles real estate development analyst. You will receive structured data about a specific parcel including zoning, lot characteristics, FAR values, applicable overlays, TOC status, incentive eligibility, and constraint flags.

Your job is to synthesize this into a concise development potential assessment.

RULES:
- Never invent data. Only reference what is provided in the structured input.
- Distinguish between facts (from city data) and your interpretation.
- If something is uncertain, say "verify with zoning counsel."
- Be direct. The reader is a real estate professional, not a layperson.
- Keep the interpretation to 2-4 sentences.
- Reference specific LA Municipal Code sections when relevant.
- If the parcel is in a TOC area, note the density bonus requirements and their impact on development economics.`

// ── Input Validation ──

const RequestSchema = z.object({
  bbl: z.string().min(1, 'Parcel ID required'), // LA uses APN, not BBL format
  lat: z.number().min(33.7, 'Latitude out of LA range').max(34.4),
  lng: z.number().min(-118.7, 'Longitude out of LA range').max(-118.1),
  address: z.string().min(1).max(200),
})

// ── Route Handler ──

export async function POST(req: Request) {
  const google = getGoogleProvider(req)
  const hasGeminiKey = Boolean(
    req.headers.get('x-gemini-api-key') ||
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim(),
  )

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    )
  }
  const { bbl, lat, lng, address } = parsed.data

  const [parcel, zoning, fireHazard, faultHazard, liquefaction, landslide, hpoz, toc, neighborhoodData] = await Promise.all([
    fetchLAParcelNear(lat, lng, address),
    fetchLAZoningNear(lat, lng),
    fetchArcGISPoint(LA_ARCGIS_LAYERS.fireHazard, lat, lng),
    fetchArcGISPoint(LA_ARCGIS_LAYERS.faultZones, lat, lng),
    fetchArcGISPoint(LA_ARCGIS_LAYERS.liquefaction, lat, lng),
    fetchArcGISPoint(LA_ARCGIS_LAYERS.landslide, lat, lng),
    fetchArcGISPoint(LA_ARCGIS_LAYERS.hpoz, lat, lng),
    fetchArcGISPoint(LA_ARCGIS_LAYERS.tocTiers, lat, lng),
    fetchNeighborhoodData(lat, lng, address),
  ])

  const zoningDistrict = zoning?.zone ?? 'Unknown'
  const farDefaults = inferFAR(zoningDistrict)
  const residFAR = farDefaults.residFAR
  const commFAR = farDefaults.commFAR
  const facilFAR = farDefaults.facilFAR
  const buildingArea = parcel?.buildingArea ?? 0
  const lotArea = Math.max(parcel?.lotArea ?? 0, 1)
  const builtFAR = buildingArea > 0 ? Number((buildingArea / lotArea).toFixed(2)) : 0
  const tocTier = getTOCTier(toc)
  const fireHazardZone = fireHazard ? 'Very High Fire Hazard Severity Zone' : null
  const faultZone = getFaultZone(faultHazard)
  const isLiquefaction = !!liquefaction
  const isLandslide = !!landslide
  const hpozName = hpoz ? String(hpoz.NAME ?? hpoz.OBJECTID ?? 'Yes') : null

  // When zoning lookup fails, use built FAR as a floor so we don't show negatives
  const rawMaxFAR = computeMaxFAR(zoningDistrict, residFAR, commFAR, facilFAR)
  const maxFAR = rawMaxFAR > 0 ? rawMaxFAR : builtFAR
  const farUpside = Math.max(0, maxFAR - builtFAR)
  const maxBuildableSF = lotArea * maxFAR

  const constraintCount = [
    !!fireHazardZone,
    !!faultZone,
    isLiquefaction,
    isLandslide,
    !!hpozName,
  ].filter(Boolean).length

  const score = computeScore(farUpside, lotArea, constraintCount)

  // Assemble deterministic parcel data
  const parcelData = {
    // Zoning (from ZIMAS + LA GeoHub)
    zoningDistrict,
    commercialOverlay: null as string | null,
    specialDistrict: null as string | null,

    // TOC (from LA GeoHub TOC layer)
    tocTier,
    tocBonusFAR: tocTier ? inferTOCBonusFAR(tocTier) : 0,

    // Lot (from LA County Assessor)
    lotArea,
    lotFrontage: 0,
    lotDepth: 0,
    landValue: parcel?.landValue ?? 0,
    impValue: parcel?.impValue ?? 0,

    // FAR (from ZIMAS)
    builtFAR,
    residFAR,
    commFAR,
    facilFAR,

    // Building (from LADBS + Assessor)
    buildingClass: parcel?.useType ?? 'Unknown',
    yearBuilt: parcel?.yearBuilt ?? 0,
    numFloors: 0,
    unitsRes: parcel?.units ?? 0,
    unitsTotal: parcel?.units ?? 0,
    buildingArea,
    apn: parcel?.apn ?? '',
    ownerName: '',

    // Constraints (from LA County + LA City)
    landmark: null,
    histDist: null,
    eDesigNum: null,
    fireHazardZone,
    isFireHazard: !!fireHazardZone,
    faultZone,
    isFaultHazard: !!faultZone,
    isLiquefaction,
    isLandslide,
    hpozName,
    mihArea: tocTier,
    mihBonusFAR: tocTier ? inferTOCBonusFAR(tocTier) : 0,

    // Computed (deterministic)
    maxFAR,
    farUpside,
    maxBuildableSF,
    score,

    // Neighborhood context
    neighborhood: neighborhoodData,
  }

  // Compute TOC development scenarios when parcel is in TOC area
  let scenarios: DevelopmentScenario[] = []
  if (tocTier) {
    scenarios = computeScenarios(zoningDistrict, lotArea, maxFAR, builtFAR, tocTier)
  }

  // Phase B: Gemini generates interpretation + structured analysis
  let interpretation = buildDeterministicInterpretation({
    zoningDistrict,
    lotArea,
    builtFAR,
    maxFAR,
    farUpside,
    maxBuildableSF,
    fireHazardZone,
    faultZone,
    tocTier,
  })
  let incentives: Array<{ name: string; status: string; detail: string; impact: string }> = []
  let envThresholds: Array<{ name: string; triggered: boolean; detail: string }> = []
  let estimatedMaxHeight = ''

  // Build scenario context for Gemini prompt
  const scenarioPrompt = scenarios.length > 0
    ? `\n\nPre-computed TOC development scenarios (provide a 1-2 sentence interpretation for each):\n${JSON.stringify(
        scenarios.map(s => ({
          name: s.name,
          maxFAR: s.maxFAR,
          maxBuildableSF: s.maxBuildableSF,
          affordabilityReq: s.affordabilityReq,
          estimatedUnits: s.estimatedUnits,
          marketRateUnits: s.marketRateUnits,
          affordableUnits: s.affordableUnits,
          isAIEstimate: s.isAIEstimate || false,
        })),
        null,
        2,
      )}`
    : ''

  // Extend schema when scenarios exist
  const scenarioSchema = scenarios.length > 0
    ? {
        scenarioInterpretations: z.array(z.object({
          name: z.string().describe('Scenario name, must match exactly one of the pre-computed scenario names'),
          interpretation: z.string().describe('1-2 sentence interpretation of this scenario\'s impact on development economics. Be specific about the trade-off between bonus FAR and affordability requirements.'),
        })).describe('One interpretation per pre-computed TOC scenario'),
      }
    : {}

  try {
    if (!hasGeminiKey) throw new Error('Gemini key not configured; using deterministic interpretation')
    const { object } = await generateObject({
      model: google(GeminiModel.PRO),
      schema: z.object({
        interpretation: z
          .string()
          .describe(
            '2-4 sentence development potential assessment for a real estate professional. ' +
            'Be specific about numbers. Flag risks. Mention FAR upside in terms of buildable SF. ' +
            'Note constraints (fire hazard, fault, landmark, environmental designation, and TOC requirements). Be direct.',
          ),
        incentives: z.array(z.object({
          name: z.string().describe('Program name, e.g. "TOC Tier 3", "Density Bonus", "Opportunity Zone"'),
          status: z.enum(['Applicable', 'Potentially Eligible', 'Not Applicable']),
          detail: z.string().describe('1-2 sentence explanation of the program and its requirements'),
          impact: z.string().describe('Quantified impact, e.g. "+37,500 sf buildable" or "35-year tax exemption"'),
        })).describe('Los Angeles development incentive programs relevant to this parcel. Include TOC/density bonus options when applicable and any other applicable programs.'),
        envThresholds: z.array(z.object({
          name: z.string().describe('Threshold category, e.g. "Residential Units > 200", "Shadow Impact", "Traffic Generation"'),
          triggered: z.boolean(),
          detail: z.string().describe('1 sentence explanation of whether this threshold is likely triggered'),
        })).describe('California and Los Angeles environmental review thresholds likely triggered by development at max buildable scale on this parcel'),
        estimatedMaxHeight: z.string().describe('Estimated max building height based on zoning district, e.g. "85 ft / 7 floors". Based on quality housing rules and contextual envelope if applicable.'),
        ...scenarioSchema,
      }),
      system: SYSTEM_PROMPT,
      prompt: `Analyze this parcel at ${address}:\n${JSON.stringify(parcelData, null, 2)}${scenarioPrompt}`,
    })
    interpretation = object.interpretation
    incentives = object.incentives
    envThresholds = object.envThresholds
    estimatedMaxHeight = object.estimatedMaxHeight

    // Merge Gemini interpretations into pre-computed scenarios
    if ('scenarioInterpretations' in object && Array.isArray(object.scenarioInterpretations)) {
      for (const si of object.scenarioInterpretations) {
        const scenario = scenarios.find(s => s.name === si.name)
        if (scenario) scenario.interpretation = si.interpretation
      }
    }
  } catch (err) {
    console.warn('Gemini interpretation skipped/failed:', err)
  }

  return Response.json({
    ...parcelData,
    geometry: parcel?.geometry ?? zoning?.geometry,
    interpretation,
    incentives,
    envThresholds,
    estimatedMaxHeight,
    ...(scenarios.length > 0 ? { scenarios } : {}),
  })
}

// ── LA Public Data Helpers ──

type AnyRecord = Record<string, unknown>

async function fetchLAZoningNear(lat: number, lng: number) {
  try {
    // Fetch multiple zoning polygons overlapping the point, then pick the best one
    // (skip tiny slivers like parking strips that misrepresent the actual zone)
    const delta = 0.005
    const url = new URL(`${LA_SOCRATA_BASE}/${LA_SOCRATA_DATASETS.zoning}.geojson`)
    url.searchParams.set('$select', 'zone_cmplt,shape_area,the_geom')
    url.searchParams.set('$where', `within_box(the_geom, ${lat + delta}, ${lng - delta}, ${lat - delta}, ${lng + delta})`)
    url.searchParams.set('$order', 'shape_area ASC')
    url.searchParams.set('$limit', '10')

    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error(`LA zoning HTTP ${res.status}`)
    const data = await res.json() as GeoJSON.FeatureCollection
    const features = data.features ?? []
    if (features.length === 0) return null

    // Filter out tiny slivers (< 1000 sq ft) and prefer R/C/M zones over P zones
    const MIN_AREA = 1000
    const meaningful = features.filter(f => {
      const area = Number(f.properties?.shape_area ?? 0)
      return area >= MIN_AREA
    })

    // Among meaningful zones, prefer residential/commercial/manufacturing over parking
    const nonParking = meaningful.filter(f => {
      const zone = String(f.properties?.zone_cmplt ?? '')
      return !/^P-?\d/i.test(zone.replace(/^\[.*?\]\s*/, '').replace(/^\(.*?\)\s*/, ''))
    })

    const feature = nonParking[0] ?? meaningful[0] ?? features[0]!
    return {
      zone: String(feature.properties?.zone_cmplt ?? 'Unknown'),
      geometry: feature.geometry ?? null,
    }
  } catch (err) {
    console.warn('LA zoning lookup failed:', err)
    return null
  }
}

const LA_COUNTY_PARCEL_IDENTIFY = 'https://public.gis.lacounty.gov/public/rest/services/LACounty_Cache/LACounty_Parcel/MapServer/identify'

async function fetchLAParcelNear(lat: number, lng: number, searchAddress?: string) {
  try {
    // LA County Assessor parcel identify — wider extent + tolerance to catch
    // parcels when geocoded point lands on street edge
    const delta = 0.003
    const url = new URL(LA_COUNTY_PARCEL_IDENTIFY)
    url.searchParams.set('geometry', `${lng},${lat}`)
    url.searchParams.set('geometryType', 'esriGeometryPoint')
    url.searchParams.set('sr', '4326')
    url.searchParams.set('layers', 'all')
    url.searchParams.set('tolerance', '20')
    url.searchParams.set('mapExtent', `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`)
    url.searchParams.set('imageDisplay', '400,400,96')
    url.searchParams.set('returnGeometry', 'true')
    url.searchParams.set('f', 'json')

    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) throw new Error(`LA County Parcel HTTP ${res.status}`)
    const data = await res.json() as { results?: Array<{ attributes?: AnyRecord; geometry?: unknown }> }
    const results = data.results?.filter(r => r.attributes) ?? []
    if (results.length === 0) return null

    // Pick the best parcel from the candidate set. LA County's identify endpoint
    // returns every parcel within the tolerance, which often includes:
    //   - sub-parcels at the same address (e.g. office tower + adjacent garage)
    //   - tax assessor "improvement" parcels with no SitusFullAddress
    //   - neighboring parcels for an entirely different street
    // The previous logic picked the first street-number match, which for
    // 633 W 5th St (Pacific Mutual area) chose the tiny adjacent parcel with
    // SQFTmain1=0 instead of the actual office tower (SQFTmain1=1.3M).
    //
    // New ordering:
    //   1. Restrict to parcels whose SitusFullAddress contains the search street
    //      number (when we have one).
    //   2. Within that set, prefer parcels that actually report building area
    //      (SQFTmain1 > 0) — that's the real improved parcel.
    //   3. Tie-break by largest SQFTmain1, then largest lot area.
    //   4. Fall back to the original first result if no street number filter
    //      produces a candidate.
    let result = results[0]!
    const streetNum = searchAddress?.match(/^\d+/)?.[0] ?? ''
    const addressMatches = streetNum
      ? results.filter(r => {
          const situs = String(r.attributes?.SitusFullAddress ?? r.attributes?.SADDR ?? '')
          return situs.includes(streetNum)
        })
      : results

    if (addressMatches.length > 0) {
      const ranked = [...addressMatches].sort((a, b) => {
        const sqfA = toNumber(a.attributes?.SQFTmain1 ?? 0)
        const sqfB = toNumber(b.attributes?.SQFTmain1 ?? 0)
        if (sqfA !== sqfB) return sqfB - sqfA
        const lotA = toNumber(a.attributes?.['Shape.STArea()'] ?? a.attributes?.Shape_Area ?? 0)
        const lotB = toNumber(b.attributes?.['Shape.STArea()'] ?? b.attributes?.Shape_Area ?? 0)
        return lotB - lotA
      })
      result = ranked[0]!
    }

    const a = result.attributes!
    return {
      lotArea: toNumber(a['Shape.STArea()'] ?? a['Shape_Area'] ?? 0),
      buildingArea: toNumber(a.SQFTmain1 ?? 0),
      useType: String(a.UseDescription ?? a.UseType ?? 'Unknown'),
      yearBuilt: toNumber(a.YearBuilt1 ?? 0),
      apn: String(a.APN ?? ''),
      address: String(a.SitusFullAddress ?? a.SADDR ?? ''),
      units: toNumber(a.Units1 ?? 0),
      landValue: toNumber(a.Roll_LandValue ?? 0),
      impValue: toNumber(a.Roll_ImpValue ?? 0),
      geometry: result.geometry ?? null,
    }
  } catch (err) {
    console.warn('LA County parcel identify failed:', err)
    return null
  }
}

async function fetchArcGISPoint(urlString: string, lat: number, lng: number): Promise<AnyRecord | null> {
  try {
    const url = new URL(urlString)
    url.searchParams.set('geometry', `${lng},${lat}`)
    url.searchParams.set('geometryType', 'esriGeometryPoint')
    url.searchParams.set('spatialRel', 'esriSpatialRelIntersects')
    url.searchParams.set('inSR', '4326')
    url.searchParams.set('outFields', '*')
    url.searchParams.set('returnGeometry', 'false')
    url.searchParams.set('f', 'json')

    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error(`ArcGIS HTTP ${res.status}`)
    const data = await res.json() as { features?: Array<{ attributes?: AnyRecord; properties?: AnyRecord }> }
    const feature = data.features?.[0]
    return feature?.attributes ?? feature?.properties ?? null
  } catch (err) {
    console.warn(`ArcGIS point lookup failed for ${urlString}:`, err)
    return null
  }
}

function inferFAR(zone: string) {
  // Strip LA zoning prefixes like [Q], [T], (Q), (T) and suffixes like -CDO, -SN, -CPIO, -CUGU, -RIO
  const base = zone
    .toUpperCase()
    .replace(/^\s*\[.*?\]\s*/, '')  // strip [Q], [T] etc
    .replace(/^\s*\(.*?\)\s*/, '')  // strip (Q), (T) etc
    .replace(/-(?:CDO|SN|CPIO|CUGU|RIO|PKM|NSO|POD|ICO|MU|RFA|RPD|LASED|LADRP|CECS).*$/i, '') // strip overlay suffixes
    .trim()

  // LA height district suffix: C2-4D → base zone C2, height district 4
  // The number after the dash is the height district (1-4), D suffix means unlimited
  const hdMatch = base.match(/^([A-Z]+\d*\.?\d*)-(\d+)([A-Z]*)$/)
  const zoneBase = hdMatch ? hdMatch[1]! : base
  const heightDistrict = hdMatch ? Number(hdMatch[2]) : 1

  // FAR multiplier from height district (LAMC §12.21.1)
  const hdMultiplier = heightDistrict >= 4 ? 13.0 : heightDistrict === 3 ? 10.0 : heightDistrict === 2 ? 6.0 : 3.0

  if (/^R5/.test(zoneBase)) return { residFAR: 6.0, commFAR: 0, facilFAR: 6.0 }
  if (/^R4/.test(zoneBase)) return { residFAR: 3.0, commFAR: 0, facilFAR: 6.0 }
  if (/^R3/.test(zoneBase)) return { residFAR: 1.5, commFAR: 0, facilFAR: 3.0 }
  if (/^RD|^R2/.test(zoneBase)) return { residFAR: 0.8, commFAR: 0, facilFAR: 3.0 }
  if (/^R1|^RS|^RE/.test(zoneBase)) return { residFAR: 0.5, commFAR: 0, facilFAR: 0.5 }
  if (/^C/.test(zoneBase)) return { residFAR: hdMultiplier, commFAR: hdMultiplier, facilFAR: hdMultiplier }
  if (/^M/.test(zoneBase)) return { residFAR: 0, commFAR: hdMultiplier * 0.5, facilFAR: hdMultiplier * 0.5 }
  if (/^P/.test(zoneBase)) return { residFAR: 0, commFAR: 0, facilFAR: 3.0 }
  return { residFAR: 0, commFAR: 0, facilFAR: 0 }
}

function getTOCTier(attrs: AnyRecord | null) {
  const tier = attrs?.FINALTIER ?? attrs?.finaltier
  return tier ? `TOC Tier ${tier}` : null
}

function inferTOCBonusFAR(tocTier: string) {
  const tier = Number(tocTier.match(/\d+/)?.[0] ?? 0)
  return tier >= 4 ? 2.25 : tier === 3 ? 1.75 : tier === 2 ? 1.25 : tier === 1 ? 0.75 : 0
}

function getFaultZone(attrs: AnyRecord | null) {
  if (!attrs) return null
  return String(attrs.HAZ_TYPE ?? attrs.TOOLTIP ?? 'Alquist-Priolo Earthquake Fault Zone')
}

function buildDeterministicInterpretation(input: {
  zoningDistrict: string
  lotArea: number
  builtFAR: number
  maxFAR: number
  farUpside: number
  maxBuildableSF: number
  fireHazardZone: string | null
  faultZone: string | null
  tocTier: string | null
}) {
  const constraints = [
    input.fireHazardZone ? 'fire hazard review' : null,
    input.faultZone ? 'fault-zone geotechnical review' : null,
    input.tocTier ? `${input.tocTier} density bonus eligibility` : null,
  ].filter(Boolean)

  const constraintText = constraints.length
    ? `Key diligence items: ${constraints.join(', ')}.`
    : 'No mapped fire, fault, or TOC constraint was found at this coordinate from the public layers checked.'

  return `${input.zoningDistrict} zoning on an approximately ${Math.round(input.lotArea).toLocaleString()} SF parcel supports an estimated max FAR of ${input.maxFAR.toFixed(2)} versus built FAR of ${input.builtFAR.toFixed(2)}. That implies roughly ${Math.round(input.maxBuildableSF).toLocaleString()} SF of max buildable area and ${input.farUpside.toFixed(2)} FAR of remaining capacity, subject to field verification and zoning counsel. ${constraintText}`
}

function toNumber(value: unknown) {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number.parseFloat(value) || 0
  return 0
}

// ── Neighborhood Data (Crime + 311 + Violations + Permits) ──

async function fetchNeighborhoodData(lat: number, lng: number, address: string): Promise<NeighborhoodData> {
  const [crimeData, complaintsData, violationsData, permitsData] = await Promise.all([
    fetchCrimeNear(lat, lng),
    fetch311Near(lat, lng),
    fetchViolationsNear(address),
    fetchPermitsNear(lat, lng),
  ])
  return {
    crime: crimeData,
    complaints311: complaintsData,
    violations: violationsData,
    permits: permitsData,
  }
}

async function fetchCrimeNear(lat: number, lng: number) {
  const fallback = { totalIncidents: 0, partICrimes: 0, partIICrimes: 0, topTypes: [] }
  try {
    const degDelta = 304 / 111_000 // ~304m radius
    const dateStr = new Date(Date.now() - 730 * 86400000).toISOString().slice(0, 19) // 2yr, ISO without ms
    const url = new URL(`${LA_SOCRATA_BASE}/${LA_SOCRATA_DATASETS.crime}.json`)
    url.searchParams.set('$where',
      `lat between '${(lat - degDelta).toFixed(5)}' and '${(lat + degDelta).toFixed(5)}' AND lon between '${(lng - degDelta).toFixed(5)}' and '${(lng + degDelta).toFixed(5)}' AND date_occ >= '${dateStr}'`)
    url.searchParams.set('$limit', '200')
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return fallback
    const rows = await res.json() as Array<{ crm_cd_desc?: string; part_1_2?: string }>
    const part1 = rows.filter(r => String(r.part_1_2) === '1').length
    const byType: Record<string, number> = {}
    for (const r of rows) {
      const t = r.crm_cd_desc || 'Unknown'
      byType[t] = (byType[t] || 0) + 1
    }
    const topTypes = Object.entries(byType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }))
    return { totalIncidents: rows.length, partICrimes: part1, partIICrimes: rows.length - part1, topTypes }
  } catch { return fallback }
}

async function fetch311Near(lat: number, lng: number) {
  const fallback = { totalComplaints: 0, topTypes: [] }
  try {
    // Use the 2026 MyLA311 dataset (live data) with lat/lng bounding box
    const degDelta = 200 / 111_000 // ~200m
    const dateStr311 = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 19)
    const url = new URL(`${LA_SOCRATA_BASE}/${LA_SOCRATA_DATASETS.complaints311_2026}.json`)
    url.searchParams.set('$where',
      `geolocation__latitude__s between '${(lat - degDelta).toFixed(5)}' and '${(lat + degDelta).toFixed(5)}' AND geolocation__longitude__s between '${(lng - degDelta).toFixed(5)}' and '${(lng + degDelta).toFixed(5)}' AND createddate >= '${dateStr311}'`)
    url.searchParams.set('$limit', '100')
    url.searchParams.set('$order', 'createddate DESC')
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return fallback
    const rows = await res.json() as Array<{ type?: string }>
    const byType: Record<string, number> = {}
    for (const r of rows) {
      const t = r.type || 'Unknown'
      byType[t] = (byType[t] || 0) + 1
    }
    const topTypes = Object.entries(byType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }))
    return { totalComplaints: rows.length, topTypes }
  } catch { return fallback }
}

async function fetchViolationsNear(address: string) {
  const fallback = { totalViolations: 0, openCases: 0 }
  try {
    const searchAddr = address.split(',')[0]?.trim().toUpperCase() ?? ''
    if (!searchAddr) return fallback
    const url = new URL(`${LA_SOCRATA_BASE}/${LA_SOCRATA_DATASETS.lahdViolations}.json`)
    url.searchParams.set('$where', `upper(address) like '%${searchAddr.replace(/'/g, "''")}%'`)
    url.searchParams.set('$limit', '50')
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return fallback
    const rows = await res.json() as Array<{ status?: string }>
    const openCases = rows.filter(r => r.status && !r.status.toLowerCase().includes('closed')).length
    return { totalViolations: rows.length, openCases }
  } catch { return fallback }
}

async function fetchPermitsNear(lat: number, lng: number) {
  const fallback = { totalPermits: 0, recentPermits: [] as Array<{ type: string; date: string; status: string }> }
  try {
    const url = new URL(LA_ARCGIS_LAYERS.ladbsPermits)
    url.searchParams.set('geometry', `${lng},${lat}`)
    url.searchParams.set('geometryType', 'esriGeometryPoint')
    url.searchParams.set('inSR', '4326')
    url.searchParams.set('spatialRel', 'esriSpatialRelIntersects')
    url.searchParams.set('distance', '100')
    url.searchParams.set('units', 'esriSRUnit_Meter')
    url.searchParams.set('outFields', 'PCIS_PERMIT,PERMIT_TYPE,STATUS,ISSUE_DATE')
    url.searchParams.set('returnGeometry', 'false')
    url.searchParams.set('f', 'json')
    url.searchParams.set('resultRecordCount', '20')
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return fallback
    const data = await res.json() as { features?: Array<{ attributes?: Record<string, unknown> }> }
    const features = data.features ?? []
    const recentPermits = features.slice(0, 5).map(f => {
      const a = f.attributes ?? {}
      return {
        type: String(a.PERMIT_TYPE ?? 'Unknown'),
        date: String(a.ISSUE_DATE ?? ''),
        status: String(a.STATUS ?? 'Unknown'),
      }
    })
    return { totalPermits: features.length, recentPermits }
  } catch { return fallback }
}
