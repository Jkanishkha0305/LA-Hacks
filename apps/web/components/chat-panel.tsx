"use client"

import { useChat } from "@ai-sdk/react"
import {
  DefaultChatTransport,
  isToolUIPart,
  getToolName,
  type UIMessage,
} from "ai"
import { useState, useRef, useEffect, useMemo } from "react"
import { Button } from "@workspace/ui/components/button"
import { Send, Loader2, FileDown, ArrowRight } from "lucide-react"
import { useReportGeneration } from "@/hooks/use-report-generation"
import {
  useJsonRenderMessage,
  Renderer,
  StateProvider,
  VisibilityProvider,
  ValidationProvider,
  ActionProvider,
} from "@json-render/react"
import { registry } from "@/lib/json-render"
import { useParcelState } from "@/lib/parcel-context"
import type { ParcelContext } from "@/lib/agents/property-analyst"
import type { PropertyAnalystUIMessage } from "@/lib/agents/property-analyst"
import {
  buildAnalysisArtifact,
  getReportFilename,
  hasRawData,
} from "@/lib/analysis-artifact"
import { downloadGeneratedReport } from "@/lib/api/report-client"
import { geminiHeaders } from "@/lib/api/headers"

const transport = new DefaultChatTransport({
  api: "/api/chat",
  headers: () => geminiHeaders(),
})

const INDEPENDENT_PROMPTS = [
  { emoji: "\ud83c\udfd7\ufe0f", label: "Analyze a property", prompt: "Analyze development potential at 633 W 5th St, Los Angeles" },
  { emoji: "\ud83d\udcca", label: "Investment check", prompt: "Evaluate 1111 S Figueroa St as an investment" },
  { emoji: "\ud83d\udd0d", label: "Risk profile", prompt: "What's the risk profile for 200 N Spring St?" },
]

const CONTEXTUAL_PROMPTS = [
  { emoji: "\ud83c\udfd7\ufe0f", label: "Development potential", prompt: "What is the full development potential of this property?" },
  { emoji: "\u26a0\ufe0f", label: "Risks & violations", prompt: "What are the risks, violations, and permits for this property?" },
  { emoji: "\ud83d\udcb0", label: "Investment analysis", prompt: "Analyze the investment potential and market context" },
]

const TOOL_LABELS: Record<string, string> = {
  geocodeAddress: "Geocoding address",
  fetchParcelData: "Fetching property data",
  fetchViolations: "Checking violations",
  fetchPermits: "Checking permits",
  fetchComplaints: "Checking complaints",
  fetchSalesComps: "Fetching sales data",
  fetchRentData: "Fetching rent data",
  fetchCrimeData: "Checking crime data",
  fetchCensusData: "Fetching census data",
}

function AssistantMessage({ message }: { message: UIMessage }) {
  const { spec, hasSpec } = useJsonRenderMessage(message.parts)

  // Collect tool parts and text parts separately
  const toolParts = message.parts.filter(isToolUIPart)
  const textParts = message.parts.filter(
    (p): p is Extract<typeof p, { type: "text" }> =>
      p.type === "text" && "text" in p && p.text.trim() !== ""
  )

  return (
    <div className="space-y-2">
      {/* Tool call indicators */}
      {toolParts.map((part, i) => {
        const name = getToolName(part)
        const label = TOOL_LABELS[name] || name
        const done = part.state === "output-available"
        return (
          <div
            key={`tool-${i}`}
            className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground"
          >
            {done ? (
              <span className="text-emerald-500">●</span>
            ) : (
              <Loader2 className="size-2.5 animate-spin" />
            )}
            <span>
              {label}
              {done ? "" : "..."}
            </span>
          </div>
        )
      })}

      {/* Rich generative UI from json-render */}
      {hasSpec && spec ? (
        <div className="mt-2 max-w-full overflow-x-hidden">
          <StateProvider initialState={{}}>
            <VisibilityProvider>
              <ValidationProvider>
                <ActionProvider>
                  <Renderer spec={spec} registry={registry} />
                </ActionProvider>
              </ValidationProvider>
            </VisibilityProvider>
          </StateProvider>
        </div>
      ) : (
        /* Fallback: plain text when no json-render spec */
        textParts.map((part, i) => (
          <div
            key={`text-${i}`}
            className="text-xs leading-relaxed whitespace-pre-wrap text-foreground"
          >
            {part.text}
          </div>
        ))
      )}
    </div>
  )
}

export function ChatPanel({
  onGeocode,
}: {
  onGeocode?: (result: { bbl: string; lat: number; lng: number; label: string; borough: string }) => void
}) {
  const { messages, sendMessage, status } = useChat({
    transport,
  })
  const [input, setInput] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const analysisArtifact = buildAnalysisArtifact(messages)
  const rawDataReady = hasRawData(analysisArtifact)
  const report = useReportGeneration()

  // Read parcel context for context-aware mode
  const { selectedBBL, parcels } = useParcelState()
  const activeParcel = useMemo<ParcelContext | null>(() => {
    if (!selectedBBL) return null
    const parcel = parcels.find((p) => p.bbl === selectedBBL)
    if (!parcel || parcel.status !== "ready" || !parcel.data) return null
    return {
      address: parcel.address,
      bbl: parcel.bbl,
      borough: parcel.borough,
      lat: parcel.lat,
      lng: parcel.lng,
      data: parcel.data,
    }
  }, [selectedBBL, parcels])

  const quickActions = activeParcel ? CONTEXTUAL_PROMPTS : INDEPENDENT_PROMPTS

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [messages])

  // Extract geocode results for map marker
  useEffect(() => {
    if (!onGeocode) return
    for (const msg of messages) {
      if (msg.role !== "assistant") continue
      for (const part of msg.parts) {
        if (
          isToolUIPart(part) &&
          getToolName(part) === "geocodeAddress" &&
          part.state === "output-available" &&
          part.output &&
          typeof part.output === "object" &&
          "bbl" in part.output &&
          "lat" in part.output &&
          "lng" in part.output &&
          "label" in part.output &&
          !("error" in part.output)
        ) {
          const output = part.output as {
            bbl: string
            lat: number
            lng: number
            label: string
            borough?: string
          }
          onGeocode({
            bbl: output.bbl,
            lat: output.lat,
            lng: output.lng,
            label: output.label,
            borough: output.borough || "Los Angeles",
          })
        }
      }
    }
  }, [messages, onGeocode])

  const handleSend = (text: string) => {
    if (!text.trim() || status !== "ready") return
    sendMessage(
      { text },
      { body: { parcelContext: activeParcel } }
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleSend(input)
    setInput("")
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Quick action buttons — always visible */}
      <div className="flex gap-1.5 border-b border-border px-2 py-2 flex-shrink-0">
        {quickActions.map((qa) => (
          <button
            key={qa.label}
            type="button"
            disabled={status !== "ready"}
            onClick={() => handleSend(qa.prompt)}
            className="flex-1 rounded-lg border border-border/50 bg-card/50 px-2 py-2 text-center transition-all hover:border-primary/30 hover:bg-primary/5 disabled:opacity-40"
            title={qa.prompt}
          >
            <div className="text-base leading-none">{qa.emoji}</div>
            <div className="mt-1 text-[9px] font-mono text-muted-foreground leading-tight">{qa.label}</div>
          </button>
        ))}
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="mt-4 text-center">
            <p className="text-[10px] text-muted-foreground/60">
              {activeParcel
                ? `Parcel loaded: ${activeParcel.address}`
                : "Tap a quick action or type an LA address below"}
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="space-y-1.5">
            {msg.role === "user" && (
              <div className="rounded-lg bg-primary/10 px-3 py-2 font-mono text-xs text-primary">
                {msg.parts
                  .filter((p) => p.type === "text")
                  .map((p) => ("text" in p ? p.text : ""))
                  .join("")}
              </div>
            )}
            {msg.role === "assistant" && <AssistantMessage message={msg} />}
          </div>
        ))}
        {status === "streaming" && (
          <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
            <Loader2 className="size-2.5 animate-spin" />
            <span>Thinking...</span>
          </div>
        )}
      </div>

      {analysisArtifact && rawDataReady && (
        <div className="border-t border-border px-2 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                Export
              </div>
              <div className="truncate text-[11px] text-foreground">
                Analysis complete — export as HTML report
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={status !== "ready" || report.isGenerating}
              onClick={() => {
                if (analysisArtifact) {
                  report.generate(analysisArtifact, getReportFilename(analysisArtifact))
                }
              }}
            >
              {report.isGenerating ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <FileDown className="size-3" />
              )}
              {report.isGenerating
                ? `Generating... (${report.elapsedSeconds}s)`
                : "Export Chat Report"}
            </Button>
          </div>
          {report.error && (
            <div className="mt-2 text-[10px] text-destructive">
              {report.error}
            </div>
          )}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="flex gap-1.5 border-t border-border p-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={status !== "ready"}
          placeholder={
            activeParcel
              ? `Ask about ${activeParcel.address}...`
              : "Chat with your real estate analyst..."
          }
          className="flex-1 bg-transparent text-xs font-mono outline-none placeholder:text-muted-foreground disabled:opacity-50"
        />
        <Button
          type="submit"
          variant="ghost"
          size="icon-xs"
          disabled={status !== "ready" || !input.trim()}
        >
          <Send className="size-3" />
        </Button>
      </form>
    </div>
  )
}
