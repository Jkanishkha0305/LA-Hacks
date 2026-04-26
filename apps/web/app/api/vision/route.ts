import { generateObject, generateImage } from 'ai'
import { GeminiModel } from '@/lib/config/models'
import { getGoogleProvider, type GoogleProvider } from '@/lib/google-provider'
import { z } from 'zod'
import type { VisionAssessment, VisionData, CoverageBreakdown, NeighborhoodDetails } from '@/lib/types'
import { LA_SOCRATA_BASE, LA_SOCRATA_DATASETS } from '@/lib/config/data-sources'

export const maxDuration = 60

const RequestSchema = z.object({
  bbl: z.string().min(1, 'Parcel ID required'),
  lat: z.number().min(33.7, 'Latitude out of LA range').max(34.4),
  lng: z.number().min(-118.7, 'Longitude out of LA range').max(-118.1),
  address: z.string().min(1).max(200),
})

const visionAssessmentSchema = z.object({
  estimatedStories: z.number().nullable(),
  currentUse: z.string(),
  condition: z.string(),
  buildingType: z.string(),
  lotFeatures: z.array(z.string()),
  constructionActivity: z.boolean(),
  adjacentContext: z.string(),
  developmentNotes: z.string(),
})

const shadowAnalysisSchema = z.object({
  shadowScore: z.number().min(1).max(10),
  estimatedHeightFt: z.number().nullable(),
  shadowDirection: z.string(),
  adjacentImpact: z.string(),
})

const coverageAnalysisSchema = z.object({
  builtPct: z.number().min(0).max(100),
  pavedPct: z.number().min(0).max(100),
  greenPct: z.number().min(0).max(100),
  segmentationNotes: z.string(),
})

const neighborhoodScoringSchema = z.object({
  walkability: z.number().min(1).max(10),
  commercialDensity: z.number().min(1).max(10),
  infrastructure: z.number().min(1).max(10),
  transitAccess: z.number().min(1).max(10),
  highlights: z.array(z.string()),
  concerns: z.array(z.string()),
})

const STREET_VIEW_PROMPT = `Analyze this Street View image of a property in Los Angeles.
Return a structured assessment:
- estimatedStories: number of floors visible (null if unclear)
- currentUse: primary use (residential, commercial, mixed, vacant lot, etc.)
- condition: building condition (excellent, good, fair, poor, vacant lot)
- buildingType: construction type (masonry, steel frame, wood frame, etc.)
- lotFeatures: notable features (corner lot, through lot, parking, signage, etc.)
- constructionActivity: whether construction or renovation is visible
- adjacentContext: brief description of neighboring buildings and streetscape
- developmentNotes: anything relevant to redevelopment potential`

const SHADOW_PROMPT = `Analyze this Street View image to assess shadow impact for a potential new development.
Consider the building height, surrounding structures, and street orientation.
- shadowScore: 1-10 (10 = minimal shadow impact on neighbors, great solar exposure; 1 = severe shadow impact)
- estimatedHeightFt: estimated height of the existing building in feet (null if vacant lot)
- shadowDirection: primary direction shadows would fall from a new building (e.g. "north", "northeast")
- adjacentImpact: brief description of how a new building at max zoning height would affect neighboring light and air`

const COVERAGE_PROMPT = `Analyze this satellite/aerial image of a Los Angeles lot. Segment the lot into coverage categories.
Return approximate percentages (must sum to ~100):
- builtPct: percentage covered by buildings/structures
- pavedPct: percentage that is paved (parking, driveways, sidewalks)
- greenPct: percentage that is green space (grass, trees, gardens)
- segmentationNotes: brief description of what you see on the lot`

const NEIGHBORHOOD_PROMPT = `You are analyzing 4 Street View images taken from the same Los Angeles intersection, facing North, East, South, and West respectively.
Score the neighborhood on each dimension (1-10):
- walkability: pedestrian infrastructure, crosswalks, sidewalk quality, foot traffic
- commercialDensity: retail, restaurants, services visible
- infrastructure: road quality, lighting, transit stops, bike lanes
- transitAccess: subway entrances, bus stops, bike docks visible
- highlights: list 2-3 positive observations
- concerns: list 1-2 concerns or negative observations`

export async function POST(req: Request) {
  const google = getGoogleProvider(req)

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

  // Phase A: Parallel data fetching (images + LA parcel data + multi-heading street views)
  const [streetViewResult, satelliteResult, parcelResult, multiSVResult] = await Promise.allSettled([
    fetchStreetView(lat, lng),
    fetchSatellite(lat, lng),
    fetchLAParcelMinimal(lat, lng),
    fetchStreetViewMulti(lat, lng),
  ])

  const streetViewBuffer = streetViewResult.status === 'fulfilled' ? streetViewResult.value : null
  const satelliteBuffer = satelliteResult.status === 'fulfilled' ? satelliteResult.value : null
  const parcelInfo = parcelResult.status === 'fulfilled' ? parcelResult.value : null
  const multiSVBuffers = multiSVResult.status === 'fulfilled' ? multiSVResult.value : null

  // Phase B: AI analysis (existing — Street View assessment + NB2 aerial)
  // Phase C: New analyses (shadow, coverage, envelope, neighborhood)
  // All run in parallel

  let assessment: VisionAssessment | null = null
  let annotatedAerial: string | null = null
  let shadowScore: number | null = null
  let shadowDiagram: string | null = null
  let coverageBreakdown: CoverageBreakdown | null = null
  let neighborhoodScore: number | null = null
  let neighborhoodDetails: NeighborhoodDetails | null = null
  let envelopeUtilization: number | null = null
  let envelopeImage: string | null = null

  // Compute envelope utilization deterministically
  if (parcelInfo) {
    const builtFAR = parseFloat(parcelInfo['builtfar'] ?? '0') || 0
    const maxFAR = Math.max(
      parseFloat(parcelInfo['residfar'] ?? '0') || 0,
      parseFloat(parcelInfo['commfar'] ?? '0') || 0,
    )
    if (maxFAR > 0) {
      envelopeUtilization = Math.round((builtFAR / maxFAR) * 100)
    }
  }

  // Run all AI analyses in parallel
  const aiResults = await Promise.allSettled([
    // B1: Street View assessment (existing)
    streetViewBuffer ? analyzeStreetView(google, streetViewBuffer) : Promise.resolve(null),
    // B2: NB2 aerial annotation (existing)
    satelliteBuffer && parcelInfo ? annotateAerial(google, satelliteBuffer, parcelInfo, address) : Promise.resolve(null),
    // C1: Shadow analysis
    streetViewBuffer && parcelInfo ? analyzeShadow(google, streetViewBuffer, parcelInfo) : Promise.resolve(null),
    // C2: Shadow diagram
    satelliteBuffer && parcelInfo ? generateShadowDiagram(google, satelliteBuffer, parcelInfo, address) : Promise.resolve(null),
    // C3: Coverage analysis
    satelliteBuffer ? analyzeCoverage(google, satelliteBuffer) : Promise.resolve(null),
    // C4: Envelope visualization
    satelliteBuffer && parcelInfo ? generateEnvelope(google, satelliteBuffer, parcelInfo, address) : Promise.resolve(null),
    // C5: Neighborhood scoring
    multiSVBuffers ? scoreNeighborhood(google, multiSVBuffers) : Promise.resolve(null),
  ])

  // Extract results — log rejected promises so image generation failures are visible
  const aiLabels = [
    'Street View assessment',
    'Annotated aerial',
    'Shadow analysis',
    'Shadow diagram',
    'Coverage analysis',
    'Envelope visualization',
    'Neighborhood scoring',
  ]
  for (let i = 0; i < aiResults.length; i++) {
    const r = aiResults[i]!
    if (r.status === 'rejected') {
      console.error(`[vision] ${aiLabels[i]} failed for ${bbl}:`, (r as PromiseRejectedResult).reason)
    }
  }

  if (aiResults[0].status === 'fulfilled' && aiResults[0].value) {
    assessment = aiResults[0].value
  }
  if (aiResults[1].status === 'fulfilled' && aiResults[1].value) {
    annotatedAerial = aiResults[1].value
  }
  if (aiResults[2].status === 'fulfilled' && aiResults[2].value) {
    shadowScore = aiResults[2].value.shadowScore
  }
  if (aiResults[3].status === 'fulfilled' && aiResults[3].value) {
    shadowDiagram = aiResults[3].value
  }
  if (aiResults[4].status === 'fulfilled' && aiResults[4].value) {
    coverageBreakdown = {
      builtPct: aiResults[4].value.builtPct,
      pavedPct: aiResults[4].value.pavedPct,
      greenPct: aiResults[4].value.greenPct,
    }
  }
  if (aiResults[5].status === 'fulfilled' && aiResults[5].value) {
    envelopeImage = aiResults[5].value
  }
  if (aiResults[6].status === 'fulfilled' && aiResults[6].value) {
    const nd = aiResults[6].value
    neighborhoodDetails = nd
    neighborhoodScore = Math.round(
      (nd.walkability + nd.commercialDensity + nd.infrastructure + nd.transitAccess) / 4 * 10
    ) / 10
  }

  const result: VisionData = {
    streetViewImage: streetViewBuffer ? streetViewBuffer.toString('base64') : null,
    streetViewMulti: multiSVBuffers ? multiSVBuffers.map(b => b.toString('base64')) : null,
    assessment,
    aerialImage: satelliteBuffer ? satelliteBuffer.toString('base64') : null,
    annotatedAerial,
    shadowScore,
    shadowDiagram,
    coverageBreakdown,
    neighborhoodScore,
    neighborhoodDetails,
    envelopeUtilization,
    envelopeImage,
  }

  return Response.json(result)
}

// ── AI Analysis Functions ──

async function analyzeStreetView(google: GoogleProvider, buffer: Buffer): Promise<VisionAssessment> {
  const { object } = await generateObject({
    model: google(GeminiModel.FLASH_IMAGE),
    schema: visionAssessmentSchema,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: STREET_VIEW_PROMPT },
        { type: 'file', data: buffer, mediaType: 'image/jpeg' },
      ],
    }],
  })
  return object
}

async function annotateAerial(
  google: GoogleProvider,
  satelliteBuffer: Buffer,
  parcelInfo: Record<string, string>,
  address: string,
): Promise<string> {
  const lotFront = parcelInfo['lotfront'] ?? '?'
  const lotDepth = parcelInfo['lotdepth'] ?? '?'
  const zoning = parcelInfo['zonedist1'] ?? 'Unknown'
  const maxFAR = Math.max(
    parseFloat(parcelInfo['residfar'] ?? '0') || 0,
    parseFloat(parcelInfo['commfar'] ?? '0') || 0,
  )

  const { image } = await generateImage({
    model: google.image(GeminiModel.FLASH_IMAGE),
    prompt: {
      images: [satelliteBuffer],
      text: `Annotate this satellite image of a lot at ${address}, Los Angeles. Draw lot boundary (yellow, ~${lotFront}ft x ${lotDepth}ft), label "${zoning} | FAR ${maxFAR}", shade buildable envelope semi-transparent blue. Style: clean, professional, like an analyst's marked-up site plan.`,
    },
  })
  return image.base64
}

async function analyzeShadow(
  google: GoogleProvider,
  streetViewBuffer: Buffer,
  parcelInfo: Record<string, string>,
): Promise<{ shadowScore: number }> {
  const context = `Building info: ${parcelInfo['numfloors'] ?? '?'} floors, lot ${parcelInfo['lotfront'] ?? '?'}ft x ${parcelInfo['lotdepth'] ?? '?'}ft, zoned ${parcelInfo['zonedist1'] ?? '?'}.`
  const { object } = await generateObject({
    model: google(GeminiModel.FLASH_IMAGE),
    schema: shadowAnalysisSchema,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: `${SHADOW_PROMPT}\n\n${context}` },
        { type: 'file', data: streetViewBuffer, mediaType: 'image/jpeg' },
      ],
    }],
  })
  return object
}

async function generateShadowDiagram(
  google: GoogleProvider,
  satelliteBuffer: Buffer,
  parcelInfo: Record<string, string>,
  address: string,
): Promise<string> {
  const numFloors = parcelInfo['numfloors'] ?? '?'
  const maxFAR = Math.max(parseFloat(parcelInfo['residfar'] ?? '0') || 0, parseFloat(parcelInfo['commfar'] ?? '0') || 0)

  const { image } = await generateImage({
    model: google.image(GeminiModel.FLASH_IMAGE),
    prompt: {
      images: [satelliteBuffer],
      text: `Annotate this satellite image of ${address}, Los Angeles to show shadow impact analysis. The existing building is ~${numFloors} floors. Draw: 1) lot boundary in yellow, 2) shadow projection from a building at max FAR ${maxFAR} as a dark semi-transparent overlay extending from the building footprint, 3) label shadow direction and approximate shadow length. Style: professional shadow study diagram.`,
    },
  })
  return image.base64
}

async function analyzeCoverage(
  google: GoogleProvider,
  satelliteBuffer: Buffer,
): Promise<{ builtPct: number; pavedPct: number; greenPct: number; segmentationNotes: string }> {
  const { object } = await generateObject({
    model: google(GeminiModel.FLASH_IMAGE),
    schema: coverageAnalysisSchema,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: COVERAGE_PROMPT },
        { type: 'file', data: satelliteBuffer, mediaType: 'image/jpeg' },
      ],
    }],
  })
  return object
}

// ── LA Zoning Bulk Controls (LAMC §12.21) ──

interface BulkControls {
  maxHeightFt: number | null
  streetWallMaxFt: number | null
  rearYardFt: number
  sideYardFt: number | null
  skyExposureRatio: string | null
  maxLotCoveragePct: number | null
  frontYardFt: number | null
  district: string
}

/**
 * Derive approximate zoning bulk controls from LA zoning district string.
 * Covers common LA zoning zones per LAMC §12.21.
 */
function deriveBulkControls(zoning: string): BulkControls {
  const z = zoning.toUpperCase().trim()

  const defaults: BulkControls = {
    maxHeightFt: null,
    streetWallMaxFt: null,
    rearYardFt: 15,
    sideYardFt: null,
    skyExposureRatio: null,
    maxLotCoveragePct: null,
    frontYardFt: null,
    district: z,
  }

  // Single-family residential
  if (/^(RE|RS|R1|RU|RZ|RW1)/.test(z)) return { ...defaults, maxHeightFt: 33, rearYardFt: 25, sideYardFt: 5, frontYardFt: 20, maxLotCoveragePct: 45 }
  // Low-density multi-family
  if (/^(RD|RW2|R2)/.test(z)) return { ...defaults, maxHeightFt: 33, rearYardFt: 25, sideYardFt: 5, frontYardFt: 15, maxLotCoveragePct: 50 }
  // Medium-density multi-family
  if (/^R3/.test(z)) return { ...defaults, maxHeightFt: 45, rearYardFt: 15, sideYardFt: 5, frontYardFt: 15, maxLotCoveragePct: 60 }
  // High-density multi-family
  if (/^R4/.test(z)) return { ...defaults, maxHeightFt: 75, rearYardFt: 15, sideYardFt: null, frontYardFt: 15, maxLotCoveragePct: null }
  if (/^R5/.test(z)) return { ...defaults, maxHeightFt: null, rearYardFt: 15, sideYardFt: null, frontYardFt: 15, maxLotCoveragePct: null }
  // Commercial
  if (/^(CR|C1|C1\.5|C2|C4|C5|CW)/.test(z)) return { ...defaults, rearYardFt: 0, maxLotCoveragePct: null }
  // Commercial manufacturing
  if (/^CM/.test(z)) return { ...defaults, maxHeightFt: 45, rearYardFt: 0 }
  // Manufacturing / industrial
  if (/^(M1|MR1|M2|M3)/.test(z)) return { ...defaults, rearYardFt: 0, maxLotCoveragePct: null }
  // Public facilities
  if (/^PF/.test(z)) return { ...defaults, maxHeightFt: 45, rearYardFt: 15, frontYardFt: 15 }
  // Open space
  if (/^OS/.test(z)) return { ...defaults, maxHeightFt: 30, rearYardFt: 25, frontYardFt: 25 }

  return defaults
}

function buildEnvelopePrompt(
  address: string,
  lotFront: string,
  lotDepth: string,
  maxFAR: number,
  maxSF: number,
  numFloors: string,
  bulk: BulkControls,
): string {
  const lines: string[] = [
    `Annotate this satellite image of ${address}, Los Angeles with a zoning-style buildable envelope diagram.`,
    `Reference Los Angeles zoning feasibility diagram conventions.`,
    '',
    `LOT DATA:`,
    `- Lot dimensions: ~${lotFront}ft frontage x ${lotDepth}ft depth`,
    `- Zoning: ${bulk.district} | Max FAR: ${maxFAR} | Max buildable: ${maxSF.toLocaleString()} SF`,
    `- Existing building: ~${numFloors} floors`,
    '',
    `BULK CONTROLS TO VISUALIZE:`,
  ]

  // Yard requirements
  const yards: string[] = []
  if (bulk.frontYardFt) yards.push(`front yard: ${bulk.frontYardFt}ft`)
  yards.push(`rear yard: ${bulk.rearYardFt}ft`)
  if (bulk.sideYardFt) yards.push(`side yards: ${bulk.sideYardFt}ft each`)
  lines.push(`- Required yards: ${yards.join(', ')}`)

  if (bulk.maxLotCoveragePct) {
    lines.push(`- Max lot coverage: ${bulk.maxLotCoveragePct}%`)
  }

  if (bulk.streetWallMaxFt) {
    lines.push(`- Street wall: max ${bulk.streetWallMaxFt}ft, then required setback above`)
  }

  if (bulk.maxHeightFt) {
    lines.push(`- Max building height: ${bulk.maxHeightFt}ft`)
  } else {
    lines.push(`- No fixed height limit (controlled by FAR and sky exposure plane)`)
  }

  if (bulk.skyExposureRatio) {
    lines.push(`- Sky exposure plane: begins at street wall, rises inward at ${bulk.skyExposureRatio} (vertical:horizontal)`)
  }

  lines.push(
    '',
    'DRAWING INSTRUCTIONS:',
    '1. Draw LOT BOUNDARY as solid yellow lines with dimension labels',
    '2. Show REQUIRED YARDS as hatched/shaded setback areas along lot edges — the building cannot occupy these zones',
    '3. Draw the MAXIMUM BUILDING ENVELOPE as a stepped 3D volume:',
  )

  if (bulk.streetWallMaxFt) {
    lines.push(
      `   a. STREET WALL portion: solid volume from ground to ${bulk.streetWallMaxFt}ft at the street-facing lot line (minus any front yard)`,
      `   b. SETBACK portion: above ${bulk.streetWallMaxFt}ft, the volume steps back from the street wall`,
    )
  }

  if (bulk.skyExposureRatio) {
    lines.push(`   c. SKY EXPOSURE PLANE: draw as a dashed diagonal line rising inward at ${bulk.skyExposureRatio} — the envelope must not penetrate this plane`)
  }

  if (bulk.maxHeightFt) {
    lines.push(`   d. MAX HEIGHT: draw a horizontal dashed line at ${bulk.maxHeightFt}ft — the envelope is capped here`)
  }

  lines.push(
    '4. Use semi-transparent blue fill for the buildable volume, darker edges for the outline',
    '5. Label key dimensions: height, street wall, setback depths, yard widths',
    `6. Label total buildable: "${maxSF.toLocaleString()} SF | FAR ${maxFAR}"`,
    '',
    'STYLE: Professional Los Angeles zoning feasibility diagram. Clean line work, dimension arrows, dashed lines for planes and limits. Like an architect\'s envelope overlay on satellite imagery.',
  )

  return lines.join('\n')
}

async function generateEnvelope(
  google: GoogleProvider,
  satelliteBuffer: Buffer,
  parcelInfo: Record<string, string>,
  address: string,
): Promise<string> {
  const lotFront = parcelInfo['lotfront'] ?? '?'
  const lotDepth = parcelInfo['lotdepth'] ?? '?'
  const zoning = parcelInfo['zonedist1'] ?? 'Unknown'
  const numFloors = parcelInfo['numfloors'] ?? '?'
  const maxFAR = Math.max(parseFloat(parcelInfo['residfar'] ?? '0') || 0, parseFloat(parcelInfo['commfar'] ?? '0') || 0)
  const lotArea = parseFloat(parcelInfo['lotarea'] ?? '0') || 0
  const maxSF = Math.round(lotArea * maxFAR)
  const bulk = deriveBulkControls(zoning)

  const { image } = await generateImage({
    model: google.image(GeminiModel.FLASH_IMAGE),
    prompt: {
      images: [satelliteBuffer],
      text: buildEnvelopePrompt(address, lotFront, lotDepth, maxFAR, maxSF, numFloors, bulk),
    },
  })
  return image.base64
}

async function scoreNeighborhood(
  google: GoogleProvider,
  buffers: Buffer[],
): Promise<NeighborhoodDetails> {
  const { object } = await generateObject({
    model: google(GeminiModel.FLASH_IMAGE),
    schema: neighborhoodScoringSchema,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: NEIGHBORHOOD_PROMPT },
        { type: 'text', text: 'Image 1 — facing North:' },
        { type: 'file', data: buffers[0]!, mediaType: 'image/jpeg' },
        { type: 'text', text: 'Image 2 — facing East:' },
        { type: 'file', data: buffers[1]!, mediaType: 'image/jpeg' },
        { type: 'text', text: 'Image 3 — facing South:' },
        { type: 'file', data: buffers[2]!, mediaType: 'image/jpeg' },
        { type: 'text', text: 'Image 4 — facing West:' },
        { type: 'file', data: buffers[3]!, mediaType: 'image/jpeg' },
      ],
    }],
  })
  return object
}

// ── Street View Static API ──

async function fetchStreetView(lat: number, lng: number): Promise<Buffer> {
  const key = process.env.GOOGLE_MAPS_API_KEY
  const url = `https://maps.googleapis.com/maps/api/streetview?size=640x480&location=${lat},${lng}&key=${key}`
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`Street View HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

async function fetchStreetViewMulti(lat: number, lng: number): Promise<Buffer[]> {
  const key = process.env.GOOGLE_MAPS_API_KEY
  const headings = [0, 90, 180, 270] // N, E, S, W
  const results = await Promise.all(
    headings.map(async (heading) => {
      const url = `https://maps.googleapis.com/maps/api/streetview?size=640x480&location=${lat},${lng}&heading=${heading}&key=${key}`
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
      if (!res.ok) throw new Error(`Street View HTTP ${res.status} heading=${heading}`)
      return Buffer.from(await res.arrayBuffer())
    }),
  )
  return results
}

// ── Maps Static API (satellite) ──

async function fetchSatellite(lat: number, lng: number): Promise<Buffer> {
  const key = process.env.GOOGLE_MAPS_API_KEY
  const url = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=18&size=640x640&maptype=satellite&key=${key}`
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`Maps Static HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

// ── LA Parcel data (via LA County Assessor identify) ──

const LA_COUNTY_PARCEL_IDENTIFY = 'https://public.gis.lacounty.gov/public/rest/services/LACounty_Cache/LACounty_Parcel/MapServer/identify'

async function fetchLAParcelMinimal(lat: number, lng: number) {
  const delta = 0.003
  const url = new URL(LA_COUNTY_PARCEL_IDENTIFY)
  url.searchParams.set('geometry', `${lng},${lat}`)
  url.searchParams.set('geometryType', 'esriGeometryPoint')
  url.searchParams.set('sr', '4326')
  url.searchParams.set('layers', 'all')
  url.searchParams.set('tolerance', '20')
  url.searchParams.set('mapExtent', `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`)
  url.searchParams.set('imageDisplay', '400,400,96')
  url.searchParams.set('returnGeometry', 'false')
  url.searchParams.set('f', 'json')

  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`LA County Parcel HTTP ${res.status}`)
  const data = await res.json() as { results?: Array<{ attributes?: Record<string, unknown> }> }
  const a = data.results?.[0]?.attributes
  if (!a) throw new Error('No parcel found at this location')

  const lotArea = Number(a['Shape.STArea()'] ?? a['Shape_Area'] ?? 0)
  const sqft = Number(a.SQFTmain1 ?? 0)
  const sideLen = Math.round(Math.sqrt(lotArea))

  // Also fetch zoning via Socrata intersects
  let zoning = 'Unknown'
  try {
    const zoningUrl = new URL(`${LA_SOCRATA_BASE}/${LA_SOCRATA_DATASETS.zoning}.geojson`)
    const zDelta = 0.005
    zoningUrl.searchParams.set('$where', `within_box(the_geom, ${lat + zDelta}, ${lng - zDelta}, ${lat - zDelta}, ${lng + zDelta})`)
    zoningUrl.searchParams.set('$limit', '1')
    const zoningRes = await fetch(zoningUrl.toString(), { signal: AbortSignal.timeout(8000) })
    if (zoningRes.ok) {
      const zoningData = await zoningRes.json() as GeoJSON.FeatureCollection
      const zf = zoningData.features?.[0]
      if (zf?.properties) {
        zoning = String(zf.properties.zone_cmplt ?? 'Unknown')
      }
    }
  } catch { /* zoning fetch is best-effort */ }

  return {
    zonedist1: zoning,
    lotfront: String(sideLen),
    lotdepth: String(sideLen),
    residfar: '1.5',
    commfar: '1.5',
    numfloors: String(Math.ceil(sqft / Math.max(lotArea, 1)) || 2),
    bldgarea: String(sqft),
    lotarea: String(lotArea),
    builtfar: String(lotArea > 0 ? (sqft / lotArea).toFixed(2) : '0'),
    bldgclass: String(a.UseDescription ?? 'Unknown'),
  } as Record<string, string>
}
