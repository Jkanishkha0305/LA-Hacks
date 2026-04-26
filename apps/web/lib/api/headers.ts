const STORAGE_KEY = "gemini-api-key"

/** Returns headers with the user's Gemini API key from localStorage (if set). */
export function geminiHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {}
  const key = localStorage.getItem(STORAGE_KEY)
  return key ? { "x-gemini-api-key": key } : {}
}
