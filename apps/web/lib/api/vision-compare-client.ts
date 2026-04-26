import type { ComparativeReport } from '@/lib/types'
import { geminiHeaders } from './headers'

export interface CompareParcelInput {
  bbl: string
  address: string
  streetViewImage: string
  aerialImage: string
  shadowScore: number | null
  coverageBuiltPct: number | null
  neighborhoodScore: number | null
  envelopeUtilization: number | null
  zoningDistrict: string | null
  lotArea: number | null
  maxFAR: number | null
  farUpside: number | null
  builtFAR: number | null
}

export async function fetchComparativeReport(
  parcels: CompareParcelInput[],
  signal?: AbortSignal,
): Promise<ComparativeReport> {
  const res = await fetch('/api/vision/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...geminiHeaders() },
    body: JSON.stringify({ parcels }),
    signal,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }

  return res.json() as Promise<ComparativeReport>
}
