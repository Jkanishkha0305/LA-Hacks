/**
 * Upstream data source URLs and dataset IDs. Mirrors apps/web/lib/config/data-sources.ts
 * Kept as a copy (not a workspace import) so the MCP server has zero coupling to
 * the Next.js app — it can ship as a standalone binary on any host.
 */
export const LA_SOCRATA_BASE = "https://data.lacity.org/resource"

export const LA_SOCRATA_DATASETS = {
  parcels: "qyra-qm2s",
  zoning: "jjxn-vhan",
  cityOwnedParcels: "enm8-v9bz",
  crime: "2nrs-mtv8",
  complaints311: "rq3b-xjk8",
  lahdViolations: "cr8f-uc4j",
  lahdInvestigation: "eagk-wq48",
} as const

export const LA_ARCGIS_LAYERS = {
  fireHazard: "https://maps.lacity.org/lahub/rest/services/Special_Areas/MapServer/11/query",
  faultZones: "https://maps.lacity.org/lahub/rest/services/Geotechnical_and_Hydrological_Information/MapServer/0/query",
  tocTiers: "https://services1.arcgis.com/tzwalEyxl2rpamKs/arcgis/rest/services/TOC_Tiers_Oct2017_new/FeatureServer/0/query",
  buildingFootprints: "https://services.arcgis.com/RmCCgQtiZLDCtblq/ArcGIS/rest/services/Los_Angeles/FeatureServer/0/query",
  liquefaction: "https://maps.lacity.org/lahub/rest/services/Geotechnical_and_Hydrological_Information/MapServer/5/query",
  landslide: "https://maps.lacity.org/lahub/rest/services/Geotechnical_and_Hydrological_Information/MapServer/4/query",
  hpoz: "https://maps.lacity.org/lahub/rest/services/City_Planning_Department/MapServer/10/query",
  ladbsPermits: "https://maps.lacity.org/lahub/rest/services/LADBS/MapServer/0/query",
} as const

export const CENSUS_BASE_URL = "https://api.census.gov/data/2022/acs/acs5"
export const FCC_GEOCODER_URL = "https://geo.fcc.gov/api/census/block/find"
export const HUD_FMR_BASE_URL = "https://www.huduser.gov/hudapi/public/fmr/data"
export const CENSUS_GEOCODER_URL = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"
export const GOOGLE_GEOCODER_URL = "https://maps.googleapis.com/maps/api/geocode/json"

export const env = {
  GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY ?? "",
  SOCRATA_APP_TOKEN: process.env.SOCRATA_APP_TOKEN ?? "",
  CENSUS_API_KEY: process.env.CENSUS_API_KEY ?? "",
  HUD_API_TOKEN: process.env.HUD_API_TOKEN ?? "",
  CACHE_DIR: process.env.SITESCOPE_CACHE_DIR ?? ".cache",
  HTTP_PORT: Number(process.env.MCP_HTTP_PORT ?? 8787),
}

export function withTimeout(ms: number): AbortSignal {
  return AbortSignal.timeout(ms)
}
