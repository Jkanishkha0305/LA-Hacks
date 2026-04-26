import { MongoClient } from "mongodb"

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined
}

// Lazy: do not connect or throw at import time. Caching is optional, so the
// app must keep working without MONGODB_URI. Callers should handle the
// "no cache available" case (analysis-cache.ts already does via try/catch).
function buildClientPromise(): Promise<MongoClient> | null {
  const uri = process.env.MONGODB_URI
  if (!uri) return null

  if (process.env.NODE_ENV === "development") {
    if (!global._mongoClientPromise) {
      global._mongoClientPromise = new MongoClient(uri, {}).connect()
    }
    return global._mongoClientPromise
  }
  return new MongoClient(uri, {}).connect()
}

export function isMongoConfigured(): boolean {
  return Boolean(process.env.MONGODB_URI)
}

export async function getDb() {
  const promise = buildClientPromise()
  if (!promise) {
    throw new Error("MONGODB_URI environment variable is not set")
  }
  const client = await promise
  return client.db("sitescope")
}
