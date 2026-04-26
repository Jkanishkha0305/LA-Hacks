import { google, createGoogleGenerativeAI } from "@ai-sdk/google"

export type GoogleProvider = typeof google

/**
 * Returns a Google Generative AI provider using the user-supplied API key
 * from the request header, falling back to the server env var.
 */
export function getGoogleProvider(req: Request) {
  const userKey = req.headers.get("x-gemini-api-key")
  if (userKey) return createGoogleGenerativeAI({ apiKey: userKey })
  return google
}

/**
 * Extracts a raw Gemini API key string from the request header or env.
 * Used for non-AI-SDK contexts (e.g. Gemini CLI in sandbox).
 */
export function getGeminiKeyFromRequest(req: Request): string {
  const userKey = req.headers.get("x-gemini-api-key")
  if (userKey) return userKey
  const envKey =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()
  if (envKey) return envKey
  throw new Error("No Gemini API key provided")
}
