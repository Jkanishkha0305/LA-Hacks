"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"

const STORAGE_KEY = "gemini-api-key"

interface ApiKeyState {
  apiKey: string | null
  setApiKey: (key: string | null) => void
}

const ApiKeyContext = createContext<ApiKeyState | null>(null)

export function ApiKeyProvider({ children }: { children: ReactNode }) {
  const [apiKey, setApiKeyState] = useState<string | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) setApiKeyState(stored)
  }, [])

  const setApiKey = useCallback((key: string | null) => {
    setApiKeyState(key)
    if (key) {
      localStorage.setItem(STORAGE_KEY, key)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  return (
    <ApiKeyContext.Provider value={{ apiKey, setApiKey }}>
      {children}
    </ApiKeyContext.Provider>
  )
}

export function useApiKey() {
  const ctx = useContext(ApiKeyContext)
  if (!ctx) throw new Error("useApiKey must be used within ApiKeyProvider")
  return ctx
}
