"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import type { AnalysisArtifact } from "@/lib/types/report"
import { geminiHeaders } from "@/lib/api/headers"

interface ReportGenerationState {
  isGenerating: boolean
  error: string | null
  elapsedSeconds: number
}

export function useReportGeneration() {
  const [state, setState] = useState<ReportGenerationState>({
    isGenerating: false,
    error: null,
    elapsedSeconds: 0,
  })
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      abortRef.current?.abort()
    }
  }, [])

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }))
  }, [])

  const generate = useCallback(
    async (artifact: AnalysisArtifact, filename: string) => {
      if (state.isGenerating) return

      setState({ isGenerating: true, error: null, elapsedSeconds: 0 })

      const startTime = Date.now()
      timerRef.current = setInterval(() => {
        setState(prev => ({
          ...prev,
          elapsedSeconds: Math.floor((Date.now() - startTime) / 1000),
        }))
      }, 1000)

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const response = await fetch("/api/report", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...geminiHeaders() },
          body: JSON.stringify({ artifact, filename }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as
            | { error?: string }
            | null
          throw new Error(data?.error || "Failed to generate report")
        }

        const blob = await response.blob()
        const disposition = response.headers.get("Content-Disposition")
        const matchedName = disposition?.match(/filename="([^"]+)"/)
        const downloadName = matchedName?.[1] || filename

        const url = window.URL.createObjectURL(blob)
        const anchor = document.createElement("a")
        anchor.href = url
        anchor.download = downloadName
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
        window.URL.revokeObjectURL(url)

        setState({ isGenerating: false, error: null, elapsedSeconds: 0 })
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return
        setState(prev => ({
          ...prev,
          isGenerating: false,
          error:
            error instanceof Error ? error.message : "Failed to generate report",
        }))
      } finally {
        if (timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
        abortRef.current = null
      }
    },
    [state.isGenerating],
  )

  return { ...state, generate, clearError }
}
