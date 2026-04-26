import type { VisionData } from '@/lib/types'
import { geminiHeaders } from './headers'

export async function fetchVisionData(
  params: { bbl: string; lat: number; lng: number; address: string },
  signal?: AbortSignal,
): Promise<VisionData> {
  const res = await fetch('/api/vision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...geminiHeaders() },
    body: JSON.stringify(params),
    signal,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }

  return res.json() as Promise<VisionData>
}
