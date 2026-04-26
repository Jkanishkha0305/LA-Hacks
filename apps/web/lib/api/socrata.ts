import { SOCRATA_BASE_URL } from "@/lib/config/data-sources"
import { env } from "@/lib/config/env"
import { socrataLimiter } from "@/lib/utils/rate-limiter"

export interface SocrataParams {
  $where?: string
  $select?: string
  $limit?: string
  $offset?: string
  $order?: string
}

export interface SocrataError {
  error: string
  source: string
}

export async function socrataQuery<T = Record<string, string>>(
  datasetId: string,
  params: SocrataParams = {},
  source = datasetId,
): Promise<T[] | SocrataError> {
  await socrataLimiter.acquire()

  const url = new URL(`${SOCRATA_BASE_URL}/${datasetId}.json`)
  if (env.SOCRATA_APP_TOKEN) {
    url.searchParams.set("$$app_token", env.SOCRATA_APP_TOKEN)
  }

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value)
    }
  }

  console.log(`[API:Socrata] Dataset: ${datasetId} | Source: ${source} | Params:`, JSON.stringify(params))
  console.log(`[API:Socrata] URL: ${url.toString()}`)

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    const res = await fetch(url.toString(), { signal: controller.signal })
    clearTimeout(timeout)

    console.log(`[API:Socrata] Response: ${res.status} ${res.statusText} (dataset: ${datasetId})`)

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      console.error(`[API:Socrata] ERROR ${res.status} for ${source}: ${body.slice(0, 500)}`)
      return { error: `Socrata ${res.status}: ${res.statusText}`, source }
    }

    const data = (await res.json()) as T[]
    console.log(`[API:Socrata] Success: ${data.length} rows from ${source}`)
    if (data.length > 0) {
      console.log(`[API:Socrata] First row keys:`, Object.keys(data[0] as object).join(", "))
    }
    return data
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error"
    console.error(`[API:Socrata] FETCH ERROR for ${source}: ${message}`)
    return { error: `Socrata fetch failed: ${message}`, source }
  }
}

export function isSocrataError(
  result: unknown,
): result is SocrataError {
  return (
    typeof result === "object" &&
    result !== null &&
    "error" in result &&
    "source" in result
  )
}
