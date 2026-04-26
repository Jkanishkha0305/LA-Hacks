import {
  LA_ARCGIS_LAYERS,
  LA_SOCRATA_BASE,
  LA_SOCRATA_DATASETS,
} from "@/lib/config/data-sources"

/**
 * Lazy fetchers for LA city-wide map layers.
 * Each returns a GeoJSON FeatureCollection for rendering with DeckGL GeoJsonLayer.
 * Called on-demand when the user toggles a layer on.
 * Zoning layer paginates through all LA features (>2000).
 */

/** Validate that a response is a proper GeoJSON FeatureCollection */
function assertGeoJSON(data: unknown): GeoJSON.FeatureCollection {
  const d = data as Record<string, unknown>
  if (d && d.type === 'FeatureCollection' && Array.isArray(d.features)) {
    return d as unknown as GeoJSON.FeatureCollection
  }
  throw new Error('Response is not valid GeoJSON FeatureCollection')
}

const PAGE_SIZE = 2000
const MAX_LAYER_FEATURES = 12000

/**
 * Paginate through an ArcGIS FeatureServer/MapServer query that supports
 * `resultOffset` + `resultRecordCount`, returning all pages merged into
 * a single GeoJSON FeatureCollection.
 */
async function fetchAllPages(
  baseUrl: string,
  params: Record<string, string>,
  maxFeatures = MAX_LAYER_FEATURES,
): Promise<GeoJSON.FeatureCollection> {
  const allFeatures: GeoJSON.Feature[] = []
  let offset = 0

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url = new URL(baseUrl)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    url.searchParams.set('resultOffset', String(offset))
    url.searchParams.set('resultRecordCount', String(PAGE_SIZE))
    url.searchParams.set('f', 'geojson')

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${baseUrl}`)

    const page = assertGeoJSON(await res.json())
    allFeatures.push(...page.features)

    // If we got fewer than PAGE_SIZE, we've reached the end
    if (page.features.length < PAGE_SIZE || allFeatures.length >= maxFeatures) break
    offset += PAGE_SIZE
  }

  return { type: 'FeatureCollection', features: allFeatures.slice(0, maxFeatures) }
}

async function fetchArcGISLayer(url: string): Promise<GeoJSON.FeatureCollection> {
  return fetchAllPages(url, {
    where: '1=1',
    outFields: '*',
    returnGeometry: 'true',
    outSR: '4326',
  })
}

// ── LA City Parcels (Socrata) ──

export async function fetchParcels(): Promise<GeoJSON.FeatureCollection> {
  const url = `${LA_SOCRATA_BASE}/${LA_SOCRATA_DATASETS.parcels}.geojson`
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`LA Parcels HTTP ${res.status}`)
  const data = await res.json()
  return assertGeoJSON(data)
}

// ── LA Zoning Districts (via server-side proxy to avoid browser timeout) ──

export async function fetchZoningDistricts(lat = 34.0522, lng = -118.2437, zoom = 11): Promise<GeoJSON.FeatureCollection> {
  const url = new URL('/api/layers/zoning', window.location.origin)
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lng', String(lng))
  url.searchParams.set('zoom', String(zoom))
  const res = await fetch(url, { signal: AbortSignal.timeout(50000) })
  if (!res.ok) throw new Error(`LA Zoning HTTP ${res.status}`)
  const data = await res.json()
  return assertGeoJSON(data)
}

// ── LA Fire Hazard Severity Zones ──

export async function fetchFireHazardZones(): Promise<GeoJSON.FeatureCollection> {
  return fetchArcGISLayer(LA_ARCGIS_LAYERS.fireHazard)
}

// ── LA Building Footprints ──

export async function fetchBuildingFootprints(): Promise<GeoJSON.FeatureCollection> {
  return fetchArcGISLayer(LA_ARCGIS_LAYERS.buildingFootprints)
}

// ── LA Earthquake Fault Zones ──

export async function fetchFaultZones(): Promise<GeoJSON.FeatureCollection> {
  return fetchArcGISLayer(LA_ARCGIS_LAYERS.faultZones)
}

// ── LA Crime Incidents (via server-side proxy) ──

export async function fetchCrimeIncidents(lat = 34.0522, lng = -118.2437, zoom = 13): Promise<GeoJSON.FeatureCollection> {
  const url = new URL('/api/layers/crime', window.location.origin)
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lng', String(lng))
  url.searchParams.set('zoom', String(zoom))
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`Crime layer HTTP ${res.status}`)
  const data = await res.json()
  return assertGeoJSON(data)
}

// ── LA Liquefaction Zones ──

export async function fetchLiquefactionZones(): Promise<GeoJSON.FeatureCollection> {
  return fetchArcGISLayer(LA_ARCGIS_LAYERS.liquefaction)
}

// ── LA TOC Transit Tiers ──

export async function fetchTOCTiers(): Promise<GeoJSON.FeatureCollection> {
  return fetchArcGISLayer(LA_ARCGIS_LAYERS.tocTiers)
}
