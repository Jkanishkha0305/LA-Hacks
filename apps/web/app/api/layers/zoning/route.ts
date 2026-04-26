import { NextResponse } from 'next/server'
import { LA_SOCRATA_BASE, LA_SOCRATA_DATASETS } from '@/lib/config/data-sources'

export const maxDuration = 45

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const lat = parseFloat(searchParams.get('lat') ?? '34.0522')
  const lng = parseFloat(searchParams.get('lng') ?? '-118.2437')
  const zoom = parseFloat(searchParams.get('zoom') ?? '11')

  // Scale viewport delta by zoom level — tighter at high zoom, wider at low zoom
  const delta = Math.max(0.03, Math.min(0.3, 0.6 / Math.pow(2, zoom - 10)))

  const url = new URL(`${LA_SOCRATA_BASE}/${LA_SOCRATA_DATASETS.zoning}.geojson`)
  url.searchParams.set('$select', 'zone_cmplt,the_geom')
  url.searchParams.set(
    '$where',
    `within_box(the_geom, ${lat + delta}, ${lng - delta}, ${lat - delta}, ${lng + delta})`,
  )
  url.searchParams.set('$limit', '2000')

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(40000) })
    if (!res.ok) throw new Error(`Socrata ${res.status}`)
    const data = await res.json()
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
