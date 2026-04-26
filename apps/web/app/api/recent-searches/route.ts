import { getRecentSearches } from "@/lib/db/analysis-cache"

export async function GET() {
  const searches = await getRecentSearches(10)
  return Response.json(
    searches.map((s) => ({
      bbl: s.bbl,
      address: s.address,
      searchedAt: s.createdAt,
      hitCount: s.hitCount,
    }))
  )
}
