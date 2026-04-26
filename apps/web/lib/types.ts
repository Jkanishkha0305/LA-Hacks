import type { DevelopmentScenario } from './zoning'
export type { DevelopmentScenario }

// ── GeoSearch API Response ──

export interface GeoSearchResult {
  label: string                    // "350 S Grand Ave, Los Angeles, CA 90071"
  name: string                     // "350 S Grand Ave"
  borough: string                  // "Los Angeles" (kept for compatibility)
  bbl: string                      // "LA-1" (temporary ID, will be APN)
  coordinates: [number, number]    // [lng, lat] — GeoJSON order
  altAddresses?: string[]          // other addresses sharing this parcel
}

// ── Parcel State ──

export type ParcelStatus = 'loading' | 'ready' | 'error'

export interface PinnedParcel {
  bbl: string
  address: string
  borough: string
  lat: number
  lng: number
  status: ParcelStatus
  agentProgress?: string           // "Fetching parcel data...", etc.
  data?: ParcelData                // populated when agent completes
  error?: string
}

// ── Parcel Data (populated by agent) ──

export interface ParcelData {
  // Zoning (from ZIMAS + LA GeoHub)
  zoningDistrict: string           // ZIMAS: ZONE_CODE
  commercialOverlay: string | null // ZIMAS: OVERLAY
  specialDistrict: string | null   // ZIMAS: SPECIAL_DISTRICT

  // TOC (from LA GeoHub TOC layer)
  tocTier: string | null           // e.g. "TOC Tier 4", "TOC Tier 3"
  tocBonusFAR: number | null       // additional FAR unlocked by TOC compliance

  // Lot (from LA County Assessor)
  lotArea: number                  // Assessor: LOT_SIZE (sq ft)
  lotFrontage: number              // Assessor: FRONTAGE (ft)
  lotDepth: number                 // Assessor: DEPTH (ft)
  landValue: number                // Assessor: Roll_LandValue
  impValue: number                 // Assessor: Roll_ImpValue
  apn: string                      // Assessor Parcel Number

  // FAR (from ZIMAS)
  builtFAR: number                 // Calculated from building permits
  residFAR: number                 // ZIMAS: RESIDENTIAL_FAR
  commFAR: number                  // ZIMAS: COMMERCIAL_FAR
  facilFAR: number                 // ZIMAS: FACILITY_FAR

  // Building (from LADBS + Assessor)
  buildingClass: string            // LADBS: BUILDING_CLASS
  yearBuilt: number                // LADBS: YEAR_BUILT
  numFloors: number                // LADBS: NUM_FLOORS
  unitsRes: number                 // Assessor: RESIDENTIAL_UNITS
  unitsTotal: number               // Assessor: TOTAL_UNITS
  buildingArea: number             // Assessor: BUILDING_AREA (sq ft)
  ownerName: string                // Assessor: OWNER_NAME

  // Constraints (from LA County + LA City)
  landmark: string | null          // LA County: LANDMARK
  histDist: string | null          // LA City: HISTORIC_DISTRICT
  eDesigNum: string | null         // LA City: ENVIRONMENTAL_DESIGNATION
  fireHazardZone: string | null   // LA City: FIRE_HAZARD_SEVERITY
  isFireHazard: boolean            // LA City: HIGH_FIRE_HAZARD_AREA
  faultZone: string | null         // CA Geological Survey: FAULT_ZONE
  isFaultHazard: boolean           // CA Geological Survey: ALQUIST_PRILOLO_ZONE
  isLiquefaction: boolean          // LA GeoHub: Liquefaction zone
  isLandslide: boolean             // LA GeoHub: Landslide zone
  hpozName: string | null          // LA City Planning: Historic Preservation Overlay Zone
  mihArea?: string | null          // TOC tier mapped for report compatibility
  mihBonusFAR?: number | null      // TOC bonus FAR mapped for report compatibility

  // Computed (deterministic — see lib/zoning.ts)
  maxFAR: number                   // MX districts: residFAR + commFAR
                                   // R districts: residFAR
                                   // C/M districts: commFAR
                                   // See computeMaxFAR() in lib/zoning.ts
  farUpside: number                // max(0, maxFAR - builtFAR)
  maxBuildableSF: number           // lotArea * maxFAR
  score: 'high' | 'med' | 'low'   // Composite: (farUpside * lotArea), penalized by constraints

  // Parcel geometry (from LA County Assessor — polygon boundary)
  geometry?: GeoJSON.Geometry

  // Neighborhood context (from LAPD, MyLA311, LAHD, LADBS)
  neighborhood?: NeighborhoodData

  // Agent interpretation
  interpretation: string           // Gemini-generated summary

  // AI-structured analysis (from Gemini generateObject)
  incentives?: Incentive[]
  envThresholds?: EnvThreshold[]
  estimatedMaxHeight?: string      // e.g. "85 ft / 7 floors"

  // MIH development scenarios (Phase 8 — only present when mihArea is set)
  scenarios?: DevelopmentScenario[]
}

export interface Incentive {
  name: string                     // "MIH Option 1", "485-x Tax Incentive"
  status: 'Applicable' | 'Potentially Eligible' | 'Not Applicable'
  detail: string                   // 1-2 sentence explanation
  impact: string                   // "+37,500 sf buildable", "35-year tax exemption"
}

export interface EnvThreshold {
  name: string                     // "Residential Units > 200"
  triggered: boolean
  detail: string                   // 1 sentence explanation
}

// ── Neighborhood Data (crime, 311, violations, permits) ──

export interface NeighborhoodData {
  crime: {
    totalIncidents: number
    partICrimes: number          // serious crimes (homicide, robbery, etc.)
    partIICrimes: number         // less serious (vandalism, DUI, etc.)
    topTypes: Array<{ type: string; count: number }>
  }
  complaints311: {
    totalComplaints: number
    topTypes: Array<{ type: string; count: number }>
  }
  violations: {
    totalViolations: number
    openCases: number
  }
  permits: {
    totalPermits: number
    recentPermits: Array<{ type: string; date: string; status: string }>
  }
}

// ── Constraint Tags (for UI) ──

export type ConstraintType = 'FIRE' | 'FAULT' | 'LIQUEFACTION' | 'LANDSLIDE' | 'HISTORIC'

// ── Context State ──

export type ViewMode = 'table' | 'report' | 'compare'

export interface ParcelState {
  parcels: PinnedParcel[]
  hoveredBBL: string | null
  sortColumn: SortableColumn | null
  sortDirection: 'asc' | 'desc'
  selectedBBL: string | null       // BBL of parcel shown in report view
  compareBBLs: string[]            // BBLs selected for side-by-side comparison
  viewMode: ViewMode
}

export type SortableColumn =
  | 'address'
  | 'zoningDistrict'
  | 'lotArea'
  | 'builtFAR'
  | 'maxFAR'
  | 'farUpside'
  | 'maxBuildableSF'
  | 'shadowScore'
  | 'coverageBuiltPct'
  | 'neighborhoodScore'
  | 'envelopeUtilization'

export type ParcelAction =
  | { type: 'PIN_PARCEL'; parcel: Omit<PinnedParcel, 'status'>  & { status: 'loading' } }
  | { type: 'UPDATE_PROGRESS'; bbl: string; progress: string }
  | { type: 'PARCEL_READY'; bbl: string; data: ParcelData }
  | { type: 'PARCEL_ERROR'; bbl: string; error: string }
  | { type: 'REMOVE_PARCEL'; bbl: string }
  | { type: 'SET_HOVERED'; bbl: string | null }
  | { type: 'SET_SORT'; column: SortableColumn }
  | { type: 'CLEAR_ALL' }
  | { type: 'SELECT_PARCEL'; bbl: string }
  | { type: 'DESELECT_PARCEL' }
  | { type: 'TOGGLE_COMPARE'; bbl: string }
  | { type: 'CLEAR_COMPARE' }
  | { type: 'START_COMPARE' }
  | { type: 'SET_VIEW'; mode: ViewMode }

// ── Vision Pipeline ──

export interface VisionAssessment {
  estimatedStories: number | null
  currentUse: string
  condition: string
  buildingType: string
  lotFeatures: string[]
  constructionActivity: boolean
  adjacentContext: string
  developmentNotes: string
}

export interface CoverageBreakdown {
  builtPct: number
  pavedPct: number
  greenPct: number
}

export interface NeighborhoodDetails {
  walkability: number
  commercialDensity: number
  infrastructure: number
  transitAccess: number
  highlights: string[]
  concerns: string[]
}

export interface VisionData {
  streetViewImage: string | null      // base64 data URL
  streetViewMulti: string[] | null    // base64 JPEGs [N, E, S, W headings]
  assessment: VisionAssessment | null
  aerialImage: string | null          // raw satellite base64
  annotatedAerial: string | null      // NB2 output base64

  // Per-parcel vision scores
  shadowScore: number | null           // 1-10, higher = less shadow impact
  shadowDiagram: string | null         // base64 annotated aerial with shadow projection
  coverageBreakdown: CoverageBreakdown | null
  neighborhoodScore: number | null     // 1-10 composite
  neighborhoodDetails: NeighborhoodDetails | null
  envelopeUtilization: number | null   // 0-100%, current built / max buildable
  envelopeImage: string | null         // base64 isometric envelope overlay
}

export type VisionStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface VisionEntry {
  status: VisionStatus
  data: VisionData | null
  error: string | null
}

export type VisionAction =
  | { type: 'VISION_START'; bbl: string }
  | { type: 'VISION_READY'; bbl: string; data: VisionData }
  | { type: 'VISION_ERROR'; bbl: string; error: string }
  | { type: 'VISION_CLEAR'; bbl: string }
  | { type: 'COMPARE_START' }
  | { type: 'COMPARE_READY'; report: ComparativeReport }
  | { type: 'COMPARE_ERROR'; error: string }
  | { type: 'COMPARE_CLEAR' }

// ── Comparative Vision ──

export interface ComparativeRanking {
  bbl: string
  rank: number
  rationale: string
}

export interface ComparativeDelta {
  metric: string
  bblA: string
  valueA: string
  bblB: string
  valueB: string
  insight: string
}

export interface ComparativeReport {
  rankings: ComparativeRanking[]
  comparativeNotes: string
  bestFor: {
    groundUp: { bbl: string; reason: string }
    value: { bbl: string; reason: string }
    rehab: { bbl: string; reason: string }
  }
  deltas: ComparativeDelta[]
  compositeAerial: string | null
}

export type ComparativeStatus = 'idle' | 'loading' | 'ready' | 'error'
