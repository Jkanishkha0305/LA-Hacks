import type { ParcelData } from '@/lib/types'
import { geminiHeaders } from './headers'

export async function fetchAgentData(
  params: { bbl: string; lat: number; lng: number; address: string },
  signal?: AbortSignal,
): Promise<ParcelData> {
  const res = await fetch('/api/parcel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...geminiHeaders() },
    body: JSON.stringify(params),
    signal,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }

  return res.json() as Promise<ParcelData>
}
