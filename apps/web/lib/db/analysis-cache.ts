import { getDb } from "./mongodb"

export interface CachedAnalysis {
  bbl: string
  address: string
  messages: unknown[]
  createdAt: Date
  hitCount: number
}

export async function getCachedAnalysis(bbl: string): Promise<CachedAnalysis | null> {
  try {
    const db = await getDb()
    const result = await db.collection<CachedAnalysis>("analyses").findOneAndUpdate(
      { bbl },
      { $inc: { hitCount: 1 } },
      { returnDocument: "after" }
    )
    return result ?? null
  } catch {
    return null
  }
}

export async function saveAnalysis(
  bbl: string,
  address: string,
  messages: unknown[]
): Promise<void> {
  try {
    const db = await getDb()
    await db.collection<CachedAnalysis>("analyses").updateOne(
      { bbl },
      {
        $set: { address, messages, createdAt: new Date() },
        $setOnInsert: { hitCount: 0 },
      },
      { upsert: true }
    )
  } catch (err) {
    console.error("[MongoDB] Failed to save analysis:", err)
  }
}

export async function getRecentSearches(limit = 10): Promise<CachedAnalysis[]> {
  try {
    const db = await getDb()
    return db
      .collection<CachedAnalysis>("analyses")
      .find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray()
  } catch {
    return []
  }
}
