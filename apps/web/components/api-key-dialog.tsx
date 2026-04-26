"use client"

import { useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { KeyRound, ExternalLink } from "lucide-react"
import { useApiKey } from "@/lib/api-key-context"

export function ApiKeyDialog() {
  const { apiKey, setApiKey } = useApiKey()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) setDraft(apiKey ?? "")
    setOpen(isOpen)
  }

  const handleSave = () => {
    const trimmed = draft.trim()
    setApiKey(trimmed || null)
    setOpen(false)
  }

  const handleClear = () => {
    setApiKey(null)
    setDraft("")
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-xs" className="relative">
          <KeyRound className="size-3.5" />
          {!apiKey && (
            <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-amber-500 animate-pulse" />
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gemini API Key</DialogTitle>
          <DialogDescription>
            Optional: add a Google AI Studio API key for richer AI-written analysis.
            Core LA parcel, zoning, hazard, and TOC lookups work without it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            type="password"
            placeholder="AIza..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            autoFocus
          />

          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Get a free API key from Google AI Studio
            <ExternalLink className="size-3" />
          </a>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Continue without key
          </Button>
          {apiKey && (
            <Button variant="destructive" size="sm" onClick={handleClear}>
              Remove key
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={!draft.trim()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
