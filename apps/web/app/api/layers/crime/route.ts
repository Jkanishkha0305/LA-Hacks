import { NextResponse } from 'next/server'
import { LA_SOCRATA_BASE, LA_SOCRATA_DATASETS } from '@/lib/config/data-sources'

export const maxDuration = 30

export async function GET(req: Request): Promise<NextResponse> {
  const { searchParams } = new URL(req.url)
  const lat = parseFloat(searchParams.get('lat') ?? '34.0522')
  const lng = parseFloat(searchParams.get('lng') ?? '-118.2437')
  const zoom = parseFloat(searchParams.get('zoom') ?? '13')

  // Scale radius by zoom: tight at high zoom, wider at low zoom
  const degDelta = Math.max(0.003, Math.min(0.05, 0.1 / Math.pow(2, zoom - 10)))
  const dateStr = new Date(Date.now() - 730 * 86400000).toISOString().slice(0, 19)

  const url = new URL(`${LA_SOCRATA_BASE}/${LA_SOCRATA_DATASETS.crime}.json`)
  url.searchParams.set('$select', 'lat,lon,crm_cd_desc,part_1_2,date_occ')
  url.searchParams.set('$where',
    `lat between '${(lat - degDelta).toFixed(5)}' and '${(lat + degDelta).toFixed(5)}' AND lon between '${(lng - degDelta).toFixed(5)}' and '${(lng + degDelta).toFixed(5)}' AND date_occ >= '${dateStr}'`)
  url.searchParams.set('$limit', '2000')

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) throw new Error(`Socrata ${res.status}`)
    const rows = await res.json() as Array<{
      lat?: string; lon?: string; crm_cd_desc?: string; part_1_2?: string; date_occ?: string
    }>

    // Convert to GeoJSON FeatureCollection for DeckGL
    const features: GeoJSON.Feature[] = rows
      .filter(r => r.lat && r.lon)
      .map(r => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [parseFloat(r.lon!), parseFloat(r.lat!)],
        },
        properties: {
          type: r.crm_cd_desc ?? 'Unknown',
          severity: r.part_1_2 === '1' ? 'serious' : 'minor',
          date: r.date_occ ?? '',
        },
      }))

    return NextResponse.json(
      { type: 'FeatureCollection', features } as GeoJSON.FeatureCollection,
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
